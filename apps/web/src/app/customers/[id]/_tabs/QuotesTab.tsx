"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { PillTabs, SectionCard } from "@/components/SectionCard";
import { useCustomerQuotes } from "@/hooks/useCustomerQuotes";
import { useCustomer } from "@/hooks/useCustomers";
import { useCurrentExchangeRates } from "@/hooks/useExchangeRates";
import { formatDate } from "@/lib/date";
import { ExchangeRatesError } from "@/app/sales/_components/ExchangeRatesError";
import { NewQuoteButton } from "@/app/sales/_components/NewQuoteButton";
import { QuoteRefLink } from "@/app/sales/_components/QuoteRefLink";
import { QuoteRoute } from "@/app/sales/_components/QuoteRoute";
import { QuoteSelling } from "@/app/sales/_components/QuoteSelling";
import { QuoteStatusPill } from "@/app/sales/_components/QuoteStatusPill";
import { customerQuoteFields } from "@/app/sales/_lib/quoteCustomer";
import { quoteHref, type QuoteOrigin } from "@/app/sales/_lib/quoteHref";
import { computeTotals } from "@/app/sales/_lib/salesQuote";
import type { SalesQuote } from "@/app/sales/_lib/salesQuote";
import { CustomerCountChip } from "../_components/CustomerCountChip";
import { CustomerKpiTile, KPI_GRID_CLASS } from "../_components/CustomerKpiTile";
import { quoteBucket, sellingByCurrency } from "../../_lib/customerQuotes";
import { EMPTY_CELL, TABLE_PAGINATION } from "../../_lib/customerTable";

interface QuotesTabProps {
  customerId: string;
}

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];

// Customers only carry sales quotes (the QCZ… lifecycle quotes from the Sales module). Here they
// are listed and opened, and started for this customer. A quote is deleted from the Quotes list
// or from its own page, not from a row here.
export function QuotesTab({ customerId }: QuotesTabProps) {
  const router = useRouter();
  const { customer } = useCustomer(customerId);
  const { quotes: rows, isLoading, isError } = useCustomerQuotes(customerId);
  // A quote opened or created here knows it, so its back link returns to this customer.
  const origin: QuoteOrigin = { from: "customer", customerId };
  // Sales converts a quote's lines into the quote's currency; quotes that store no rates use this sheet.
  const exchange = useCurrentExchangeRates();
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => (filter === "all" ? rows : rows.filter((q) => quoteBucket(q) === filter)), [rows, filter]);

  const stats = useMemo(() => {
    const count = (bucket: string) => rows.filter((q) => quoteBucket(q) === bucket).length;
    const won = count("won");
    const lost = count("lost");
    // Same definition as the Sales report: won out of the decided (won + lost) quotes.
    const decided = won + lost;

    return {
      open: count("open"),
      won,
      lost,
      expired: count("expired"),
      conversion: decided > 0 ? `${Math.round((won / decided) * 100)}%` : null,
      // Not known before the Exchange sheet is: without it the sum would first show short of
      // every line that needs converting.
      wonRevenue: exchange.isLoading ? null : sellingByCurrency(rows.filter((q) => quoteBucket(q) === "won"), exchange.rates),
    };
  }, [rows, exchange.rates, exchange.isLoading]);

  // A dash when nothing won has a price; "…" while the sum is not known yet.
  let wonRevenueValue: React.ReactNode = EMPTY_CELL;
  if (!stats.wonRevenue) wonRevenueValue = "…";
  else if (stats.wonRevenue.text) wonRevenueValue = <span title={stats.wonRevenue.text}>{stats.wonRevenue.text}</span>;

  let emptyText = filter === "all" ? "No quotes for this customer yet" : `No ${filter} quotes`;
  if (isError) emptyText = "Could not load quotes.";

  // antd keeps the current page when the rows change, so another bucket would open on a later
  // page with its first quotes hidden. Switching the filter therefore returns to page 1.
  const handleFilterChange = (key: string) => {
    setFilter(key);
    setPage(1);
  };

  const columns: ColumnsType<SalesQuote> = [
    {
      title: "Sales Number",
      dataIndex: "quoteNumber",
      width: 170,
      // The whole row opens the quote too.
      render: (v: string) => <QuoteRefLink quoteNumber={v} origin={origin} />,
    },
    { title: "Status", key: "status", width: 130, render: (_: unknown, r) => <QuoteStatusPill status={r.status} /> },
    { title: "Freight Mode", key: "service", width: 110, render: (_: unknown, r) => r.data.serviceType || EMPTY_CELL },
    {
      title: "Route",
      key: "route",
      width: 180,
      render: (_: unknown, r) => <QuoteRoute origin={r.data.origin} destination={r.data.destination} />,
    },
    {
      title: "Valid until",
      key: "valid",
      width: 150,
      render: (_: unknown, r) => {
        if (!r.validUntil) return EMPTY_CELL;
        // Red goes with the status Expired, as in Sales: the date of a won or lost quote is no alarm.
        const expired = r.status === "expired";
        return (
          <span className={expired ? "text-red-600" : "text-slate-600"}>
            {formatDate(r.validUntil)}
            {expired ? " (expired)" : ""}
          </span>
        );
      },
    },
    {
      title: "Selling",
      key: "selling",
      width: 130,
      align: "right",
      className: "tabular-nums",
      render: (_: unknown, r) => {
        const totals = computeTotals(r.data, exchange.rates);
        // A quote without a price shows a dash - unless the price is only missing an exchange rate.
        return totals.selling || totals.missingSellingRates.length ? <QuoteSelling totals={totals} /> : EMPTY_CELL;
      },
    },
    { title: "Created", dataIndex: "createdAt", width: 110, render: (v: string) => formatDate(v) || EMPTY_CELL },
  ];

  return (
    <div className="space-y-5">
      <ExchangeRatesError exchange={exchange} />

      <div className={KPI_GRID_CLASS}>
        {/* Expired quotes are in none of the next three tiles; the hint keeps the row adding up. */}
        <CustomerKpiTile label="Total" value={rows.length} hint={stats.expired > 0 ? `${stats.expired} expired` : undefined} />
        <CustomerKpiTile label="Open" value={stats.open} />
        <CustomerKpiTile label="Won" value={stats.won} tone={stats.won > 0 ? "green" : undefined} />
        <CustomerKpiTile label="Lost" value={stats.lost} tone={stats.lost > 0 ? "red" : undefined} />
        <CustomerKpiTile label="Conversion" value={stats.conversion ?? EMPTY_CELL} />
        {/* Several currencies can outgrow the tile, so the full figure is also the tooltip. A sum
            short of the lines that cannot be converted says so under the figure. */}
        <CustomerKpiTile
          label="Won revenue"
          value={wonRevenueValue}
          tone={stats.wonRevenue?.incomplete ? "amber" : undefined}
          hint={stats.wonRevenue?.incomplete ? "Unconverted lines left out" : undefined}
          hintTone="amber"
        />
      </div>

      <SectionCard
        title="Quotes"
        bodyClassName="p-2"
        extra={
          <>
            <CustomerCountChip count={rows.length} />
            {/* The new quote starts with this customer and its main contact filled in. */}
            {customer && <NewQuoteButton start={() => customerQuoteFields(customer)} origin={origin} />}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3 px-2 pb-3">
          <PillTabs tabs={FILTER_TABS} active={filter} onChange={handleFilterChange} />
          <span className="ml-auto text-xs text-slate-500 tabular-nums">
            {filtered.length} of {rows.length}
          </span>
        </div>

        <Table<SalesQuote>
          size="small"
          rowKey="quoteNumber"
          loading={isLoading || exchange.isLoading}
          dataSource={filtered}
          columns={columns}
          scroll={{ x: "max-content" }}
          pagination={{ ...TABLE_PAGINATION, current: page, onChange: setPage }}
          locale={{ emptyText }}
          rowClassName="cursor-pointer"
          onRow={(r) => ({ onClick: () => router.push(quoteHref(r.quoteNumber, origin)) })}
        />
      </SectionCard>
    </div>
  );
}
