"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Table } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PillTabs, SectionCard } from "@/components/SectionCard";
import { useCustomerQuotes } from "@/hooks/useCustomerQuotes";
import { formatDate } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { computeTotals, fmt, validityInfo } from "@/app/sales/_lib/salesQuote";
import type { SalesQuote } from "@/app/sales/_lib/salesQuote";
import { QUOTE_STATUS_MAP, QUOTE_STATUSES } from "@/app/sales/_lib/types";
import { CustomerCountChip } from "../_components/CustomerCountChip";
import { CustomerKpiTile, KPI_GRID_CLASS } from "../_components/CustomerKpiTile";
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

// "Open" means what the Sales pipeline shows as still in play: every lifecycle status that is
// neither decided (won / lost) nor expired. Sales exports the statuses but no open list, so the
// open ones are derived from its list instead of being copied here.
const CLOSED_STATUSES = ["won", "lost", "expired"];
const OPEN_STATUSES = new Set(QUOTE_STATUSES.filter((s) => !CLOSED_STATUSES.includes(s.key)).map((s) => s.key));

// The bucket a quote counts in: "open" for every open status, otherwise the status itself
// ("won", "lost", "expired"). An expired quote matches no quick filter and shows under "All" only.
function quoteBucket(quote: SalesQuote): string {
  const status = quote.data.quoteStatus ?? "";
  return OPEN_STATUSES.has(status) ? "open" : status;
}

// A quote whose currency was never changed stores none; Sales shows such a quote in EUR.
const DEFAULT_QUOTE_CURRENCY = "EUR";

const quoteHref = (quoteNumber: string) => `/sales/quote/${quoteNumber}`;

// Customers only carry sales quotes (the QCZ… lifecycle quotes from the Sales module).
// They are created in Sales; here they are listed, opened and can be deleted.
export function QuotesTab({ customerId }: QuotesTabProps) {
  const router = useRouter();
  const { quotes: rows, isLoading, isError, deleteQuote } = useCustomerQuotes(customerId);
  const toast = useToast();
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => (filter === "all" ? rows : rows.filter((q) => quoteBucket(q) === filter)), [rows, filter]);

  const stats = useMemo(() => {
    const count = (bucket: string) => rows.filter((q) => quoteBucket(q) === bucket).length;
    const won = count("won");
    const lost = count("lost");
    // Same definition as the Sales report: won out of the decided (won + lost) quotes.
    const decided = won + lost;

    // Quotes are priced in their own currency, so won revenue is summed per currency, never across.
    const wonByCurrency = new Map<string, number>();
    for (const quote of rows) {
      if (quoteBucket(quote) !== "won") continue;
      const currency = quote.data.currency || DEFAULT_QUOTE_CURRENCY;
      wonByCurrency.set(currency, (wonByCurrency.get(currency) ?? 0) + computeTotals(quote.data).selling);
    }
    const wonRevenue = [...wonByCurrency]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => fmt(amount, currency))
      .join(" · ");

    return {
      open: count("open"),
      won,
      lost,
      expired: count("expired"),
      conversion: decided > 0 ? `${Math.round((won / decided) * 100)}%` : null,
      wonRevenue: wonRevenue || null,
    };
  }, [rows]);

  let emptyText = filter === "all" ? "No quotes for this customer yet" : `No ${filter} quotes`;
  if (isError) emptyText = "Could not load quotes.";

  // antd keeps the current page when the rows change, so another bucket would open on a later
  // page with its first quotes hidden. Switching the filter therefore returns to page 1.
  const handleFilterChange = (key: string) => {
    setFilter(key);
    setPage(1);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteQuote(deleteTarget);
      toast.success("Quote deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete quote");
    } finally {
      setDeleting(false);
    }
  };

  const columns: ColumnsType<SalesQuote> = [
    {
      title: "Reference",
      dataIndex: "quoteNumber",
      width: 170,
      // The whole row opens the quote too; stopping the click here leaves the link its own
      // behaviour (open in a new tab) without the row also navigating this one.
      render: (v: string) => (
        <Link href={quoteHref(v)} onClick={(e) => e.stopPropagation()} className="font-mono font-semibold text-indigo-600 hover:underline">
          {v}
        </Link>
      ),
    },
    {
      title: "Status",
      key: "status",
      width: 130,
      render: (_: unknown, r) => {
        const s = QUOTE_STATUS_MAP[r.data.quoteStatus ?? ""];
        if (!s) return EMPTY_CELL;
        return (
          <span className="rounded-xl text-[11px] font-medium px-2.5 py-0.5" style={{ backgroundColor: s.color.bg, color: s.color.text }}>
            {s.label}
          </span>
        );
      },
    },
    { title: "Service", key: "service", width: 110, render: (_: unknown, r) => r.data.serviceType || EMPTY_CELL },
    {
      title: "Route",
      key: "route",
      width: 180,
      render: (_: unknown, r) => {
        if (!r.data.origin && !r.data.destination) return EMPTY_CELL;
        return (
          <span className="text-slate-600">
            {r.data.origin || "—"} <span className="text-slate-300">→</span> {r.data.destination || "—"}
          </span>
        );
      },
    },
    {
      title: "Valid until",
      key: "valid",
      width: 150,
      render: (_: unknown, r) => {
        const validity = validityInfo(r.data);
        if (!validity.date) return EMPTY_CELL;
        return (
          <span className={validity.expired ? "text-red-600" : "text-slate-600"}>
            {formatDate(validity.date)}
            {validity.expired ? " (expired)" : ""}
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
        const { selling } = computeTotals(r.data);
        return selling ? fmt(selling, r.data.currency || DEFAULT_QUOTE_CURRENCY) : EMPTY_CELL;
      },
    },
    { title: "Created", dataIndex: "createdAt", width: 110, render: (v: string) => formatDate(v) || EMPTY_CELL },
    {
      title: "",
      key: "actions",
      width: 48,
      render: (_: unknown, r) => (
        <div className="flex justify-end gap-1">
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            aria-label={`Delete quote ${r.quoteNumber}`}
            onClick={(e) => {
              // Row clicks open the quote; the button must not.
              e.stopPropagation();
              setDeleteTarget(r.quoteNumber);
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className={KPI_GRID_CLASS}>
        {/* Expired quotes are in none of the next three tiles; the hint keeps the row adding up. */}
        <CustomerKpiTile label="Total" value={rows.length} hint={stats.expired > 0 ? `${stats.expired} expired` : undefined} />
        <CustomerKpiTile label="Open" value={stats.open} />
        <CustomerKpiTile label="Won" value={stats.won} tone={stats.won > 0 ? "green" : undefined} />
        <CustomerKpiTile label="Lost" value={stats.lost} tone={stats.lost > 0 ? "red" : undefined} />
        <CustomerKpiTile label="Conversion" value={stats.conversion ?? EMPTY_CELL} />
        {/* Several currencies can outgrow the tile, so the full figure is also the tooltip. */}
        <CustomerKpiTile
          label="Won revenue"
          value={stats.wonRevenue ? <span title={stats.wonRevenue}>{stats.wonRevenue}</span> : EMPTY_CELL}
        />
      </div>

      <SectionCard title="Quotes" bodyClassName="p-2" extra={<CustomerCountChip count={rows.length} />}>
        <div className="flex flex-wrap items-center gap-3 px-2 pb-3">
          <PillTabs tabs={FILTER_TABS} active={filter} onChange={handleFilterChange} />
          <span className="ml-auto text-xs text-slate-500 tabular-nums">
            {filtered.length} of {rows.length}
          </span>
        </div>

        <Table<SalesQuote>
          size="small"
          rowKey="quoteNumber"
          loading={isLoading}
          dataSource={filtered}
          columns={columns}
          scroll={{ x: "max-content" }}
          pagination={{ ...TABLE_PAGINATION, current: page, onChange: setPage }}
          locale={{ emptyText }}
          rowClassName="cursor-pointer"
          onRow={(r) => ({ onClick: () => router.push(quoteHref(r.quoteNumber)) })}
        />
      </SectionCard>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete quote"
        description={`Delete quote ${deleteTarget ?? ""}? This deletes the sales quote for the whole company, not only on this customer's page: it disappears from the Sales module and its reference can never be reused.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
      />
    </div>
  );
}
