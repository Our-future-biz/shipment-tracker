"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Table, Spin } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useAllSalesQuotes } from "@/hooks/useAllSalesQuotes";
import { useCurrentExchangeRates } from "@/hooks/useExchangeRates";
import { computeTotals, fmtByCurrency, newestFirst, type CurrencyAmount, type QuoteTotals, type SalesQuote } from "@/app/sales/_lib/salesQuote";
import { QUOTE_STATUS_MAP } from "@/app/sales/_lib/types";
import { toCzkAt, usePeriodAverages } from "@/app/sales/_lib/usePeriodAverages";
import { ExchangeRatesError } from "./ExchangeRatesError";
import { QuotesLoadError } from "./QuotesLoadError";
import { QuotesLoading } from "./QuotesLoading";
import { QuoteRefLink } from "./QuoteRefLink";
import { QuoteStatusPill } from "./QuoteStatusPill";
import { SalesDialog } from "./SalesDialog";
import { formatDate } from "@/lib/date";

interface Kpi {
  label: string;
  value: string;
}

// Money in the rows below is in CZK: each quote's figures converted at the ČNB average of the month
// it was sent (or created, if never sent) - fixed rates, no ROE %. Kept as formatted text.
interface ServiceRow {
  serviceType: string;
  quotes: number;
  won: number;
  selling: string;
  profit: string;
  avgMargin: number;
}

interface StatusRow {
  status: string;
  count: number;
  selling: string;
}

interface OwnerRow {
  owner: string;
  quotes: number;
  won: number;
  lost: number;
  selling: string;
  avgMargin: number;
  conversion: number;
}

// A quote with its totals, which are in the quote's own currency, and those in CZK (null when the
// month's ČNB average for its currency is not known).
interface PricedQuote extends SalesQuote {
  totals: QuoteTotals;
  czk: { selling: number; profit: number } | null;
}

// The month whose ČNB average converts a quote: when it was sent, or created if never sent.
const monthOf = (q: SalesQuote) => (q.data.sentAt || q.createdAt || "").slice(0, 7);

// The quotes of one table row, added up.
interface Group {
  quotes: number;
  won: number;
  lost: number;
  selling: CurrencyAmount[];
  profit: CurrencyAmount[];
  marginSum: number;
}

// A margin is a percentage within one quote, so averaging it over quotes mixes no currencies. A
// quote without selling counts as 0, as it always has in this report.
const marginOf = (q: PricedQuote) => q.totals.margin ?? 0;

function groupQuotes(priced: PricedQuote[], keyOf: (q: PricedQuote) => string): [string, Group][] {
  const groups = new Map<string, Group>();
  for (const q of priced) {
    const key = keyOf(q);
    const group = groups.get(key) ?? { quotes: 0, won: 0, lost: 0, selling: [], profit: [], marginSum: 0 };
    group.quotes += 1;
    if (q.status === "won") group.won += 1;
    if (q.status === "lost") group.lost += 1;
    if (q.czk) {
      group.selling.push(["CZK", q.czk.selling]);
      group.profit.push(["CZK", q.czk.profit]);
    }
    group.marginSum += marginOf(q);
    groups.set(key, group);
  }
  return [...groups];
}

// The owner a quote is counted under in "By sales owner".
const ownerOf = (q: SalesQuote) => q.ownerName || "Unassigned";

// A table cell with a sum per currency; a dash when the row has nothing to add up.
const money = (v: string) => v || "—";

export function SalesReportTab() {
  // The report is over every quote of the company: they are loaded completely before anything is
  // added up, and the rows below keep the order of a list that is newest first.
  const { quotes, isLoading, progress, isError, reload } = useAllSalesQuotes();
  const exchange = useCurrentExchangeRates();
  // The sales owner whose quotes are listed in the dialog, while it is open.
  const [ownerQuotes, setOwnerQuotes] = useState<string | null>(null);
  const avg = usePeriodAverages(quotes.map((q) => Number(monthOf(q).slice(0, 4))).filter(Boolean));

  const priced = useMemo<PricedQuote[]>(
    () =>
      [...quotes].sort(newestFirst).map((q) => {
        const totals = computeTotals(q.data, exchange.rates, exchange);
        const month = monthOf(q);
        const selling = toCzkAt(totals.selling, totals.currency, month, avg);
        const profit = toCzkAt(totals.profit, totals.currency, month, avg);
        return { ...q, totals, czk: selling === null || profit === null ? null : { selling, profit } };
      }),
    [quotes, exchange, avg],
  );

  // Their figures leave lines out; the report says so instead of passing partial sums for whole ones.
  const incomplete = priced.filter((q) => q.totals.missingRates.length > 0);
  // Quotes whose month has no ČNB average for their currency are not in the CZK sums.
  const unconvertible = priced.filter((q) => q.czk === null);

  const kpis = useMemo<Kpi[]>(() => {
    const total = priced.length;
    const won = priced.filter((q) => q.status === "won");
    const lost = priced.filter((q) => q.status === "lost");
    const wonRevenue = fmtByCurrency(won.flatMap((q): CurrencyAmount[] => (q.czk ? [["CZK", q.czk.selling]] : [])));
    const avgMargin = total ? Math.round(priced.reduce((sum, q) => sum + marginOf(q), 0) / total) : 0;
    const decided = won.length + lost.length;
    const conversion = decided ? Math.round((won.length / decided) * 100) : 0;
    return [
      { label: "Total Quotes", value: String(total) },
      { label: "Won", value: String(won.length) },
      { label: "Lost", value: String(lost.length) },
      { label: "Revenue (Won)", value: wonRevenue || "—" },
      { label: "Avg Margin", value: `${avgMargin}%` },
      { label: "Conversion", value: `${conversion}%` },
    ];
  }, [priced]);

  const serviceRows = useMemo<ServiceRow[]>(
    () =>
      groupQuotes(priced, (q) => q.data.serviceType || "Unspecified").map(([serviceType, g]) => ({
        serviceType,
        quotes: g.quotes,
        won: g.won,
        selling: fmtByCurrency(g.selling),
        profit: fmtByCurrency(g.profit),
        avgMargin: Math.round(g.marginSum / g.quotes),
      })),
    [priced],
  );

  // By the status that is shown: a quote whose validity has passed counts as Expired, not as Quoted.
  const statusRows = useMemo<StatusRow[]>(
    () =>
      groupQuotes(priced, (q) => q.status).map(([status, g]) => ({
        status,
        count: g.quotes,
        selling: fmtByCurrency(g.selling),
      })),
    [priced],
  );

  const ownerRows = useMemo<OwnerRow[]>(
    () =>
      groupQuotes(priced, ownerOf).map(([owner, g]) => {
        const decided = g.won + g.lost;
        return {
          owner,
          quotes: g.quotes,
          won: g.won,
          lost: g.lost,
          selling: fmtByCurrency(g.selling),
          avgMargin: Math.round(g.marginSum / g.quotes),
          conversion: decided ? Math.round((g.won / decided) * 100) : 0,
        };
      }),
    [priced],
  );

  const ownerColumns: ColumnsType<OwnerRow> = [
    {
      title: "Sales Owner",
      dataIndex: "owner",
      // Opens the quotes counted in the row.
      render: (v: string) => (
        <button
          type="button"
          onClick={() => setOwnerQuotes(v)}
          className="font-medium text-indigo-600 hover:underline bg-transparent border-0 p-0 cursor-pointer"
        >
          {v}
        </button>
      ),
    },
    { title: "Quotes", dataIndex: "quotes" },
    { title: "Won", dataIndex: "won" },
    { title: "Lost", dataIndex: "lost" },
    { title: "Total Selling Costs", dataIndex: "selling", align: "right", render: money },
    { title: "Avg Margin", dataIndex: "avgMargin", align: "right", render: (v: number) => `${v}%` },
    { title: "Conversion", dataIndex: "conversion", align: "right", render: (v: number) => `${v}%` },
  ];

  const serviceColumns: ColumnsType<ServiceRow> = [
    {
      title: "Freight Mode",
      dataIndex: "serviceType",
      render: (v: string) => <span className="font-medium text-slate-700">{v}</span>,
    },
    { title: "Quotes", dataIndex: "quotes" },
    { title: "Won", dataIndex: "won" },
    { title: "Total Selling Costs", dataIndex: "selling", align: "right", render: money },
    { title: "Profit", dataIndex: "profit", align: "right", render: money },
    { title: "Avg Margin", dataIndex: "avgMargin", align: "right", render: (v: number) => `${v}%` },
  ];

  const statusColumns: ColumnsType<StatusRow> = [
    {
      title: "Quote Status",
      dataIndex: "status",
      render: (v: string) => {
        const def = QUOTE_STATUS_MAP[v];
        return (
          <span className="text-slate-700">
<span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${def?.tone.dot ?? ""}`} />
            {def?.label ?? v}
          </span>
        );
      },
    },
    { title: "Count", dataIndex: "count" },
    { title: "Total Selling Costs", dataIndex: "selling", align: "right", render: money },
  ];

  // Figures over the quotes that happened to load would be too small, and zeros would be a lie.
  if (isError) return <QuotesLoadError onRetry={() => reload()} />;
  if (isLoading) return <QuotesLoading progress={progress} />;

  // Drafts are priced at today's ČNB rates and the sums use the monthly averages: both must be in.
  if (exchange.isLoading || avg.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spin />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* What the figures cover: the quotes that were really loaded - all of them, or the report would not be shown. */}
      <div className="text-xs text-slate-500">All {quotes.length.toLocaleString("en-US")} quotes</div>
      <div className="text-xs text-slate-500">Amounts in CZK at the ČNB average of the month each quote was sent (or created).</div>
      {/* Rates that could not be read leave the same lines out, but nothing is missing. */}
      <ExchangeRatesError exchange={exchange} />
      {!exchange.isError && incomplete.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message="Lines in a currency ČNB does not publish are not in the figures below"
          description={`Quotes: ${incomplete.map((q) => q.quoteNumber).join(", ")}.`}
        />
      )}
      {unconvertible.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message="Quotes without a ČNB monthly average for their currency are not in the CZK sums"
          description={`Quotes: ${unconvertible.map((q) => q.quoteNumber).join(", ")}.`}
        />
      )}
      <div className="grid grid-cols-6 gap-3 mb-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5">
            <div className="text-[11px] text-slate-400 uppercase tracking-wide">{k.label}</div>
            <div className="text-lg font-bold text-slate-800 mt-0.5">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="text-sm font-semibold text-slate-800 mb-3">By sales owner</div>
        <Table<OwnerRow>
          size="small"
          rowKey="owner"
          dataSource={ownerRows}
          columns={ownerColumns}
          pagination={false}
          locale={{ emptyText: "No quotes yet" }}
        />
      </div>

      {ownerQuotes !== null && (
        <OwnerQuotesDialog owner={ownerQuotes} quotes={priced.filter((q) => ownerOf(q) === ownerQuotes)} onClose={() => setOwnerQuotes(null)} />
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="text-sm font-semibold text-slate-800 mb-3">By service type</div>
        <Table<ServiceRow>
          size="small"
          rowKey="serviceType"
          dataSource={serviceRows}
          columns={serviceColumns}
          pagination={false}
          locale={{ emptyText: "No quotes yet" }}
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <div className="text-sm font-semibold text-slate-800 mb-3">By status</div>
        <Table<StatusRow>
          size="small"
          rowKey="status"
          dataSource={statusRows}
          columns={statusColumns}
          pagination={false}
          locale={{ emptyText: "No quotes yet" }}
        />
      </div>
    </div>
  );
}

// The quotes a sales owner's row counts, newest first, with the figures the report adds up for
// them: selling in CZK at the month's ČNB average and the margin. A reference opens the quote.
function OwnerQuotesDialog({ owner, quotes, onClose }: { owner: string; quotes: PricedQuote[]; onClose: () => void }) {
  const columns: ColumnsType<PricedQuote> = [
    { title: "Sales Reference", dataIndex: "quoteNumber", width: 170, render: (v: string) => <QuoteRefLink quoteNumber={v} /> },
    { title: "Customer", key: "customer", ellipsis: true, render: (_: unknown, q) => q.data.customerName || "—" },
    { title: "Status", key: "status", width: 110, render: (_: unknown, q) => <QuoteStatusPill status={q.status} /> },
    { title: "Created", key: "created", width: 100, render: (_: unknown, q) => <span className="tabular-nums">{formatDate(q.createdAt)}</span> },
    {
      title: "Selling (CZK)",
      key: "selling",
      width: 140,
      align: "right",
      render: (_: unknown, q) => <span className="tabular-nums">{q.czk ? fmtByCurrency([["CZK", q.czk.selling]]) : "—"}</span>,
    },
    { title: "Margin", key: "margin", width: 80, align: "right", render: (_: unknown, q) => `${marginOf(q)}%` },
  ];
  return (
    <SalesDialog
      open
      size="reading"
      onClose={onClose}
      title={`Quotes of ${owner}`}
      subtitle={`${quotes.length} ${quotes.length === 1 ? "quote" : "quotes"}, as counted in the report`}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <Table<PricedQuote>
        size="small"
        rowKey="quoteNumber"
        dataSource={quotes}
        columns={columns}
        tableLayout="fixed"
        pagination={quotes.length > 20 ? { pageSize: 20, size: "small", showSizeChanger: false } : false}
        locale={{ emptyText: "No quotes" }}
      />
    </SalesDialog>
  );
}
