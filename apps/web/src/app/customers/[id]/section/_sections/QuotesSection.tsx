"use client";

import { Table, Spin } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { KpiCard, SectionCard } from "./shared";
import { useSalesQuotes } from "@/hooks/useSalesQuotes";
import { computeTotals, validityInfo, fmt, type SalesQuote } from "@/app/sales/_lib/salesQuote";
import { QUOTE_STATUS_MAP } from "@/app/sales/_lib/types";

const OPEN_STATUSES = ["draft", "ready_to_send", "quoted", "feedback", "revised"];

export function QuotesSection({ customerId }: { customerId: string }) {
  const router = useRouter();
  const { salesQuotes, isLoading } = useSalesQuotes();

  const rows = useMemo(
    () => salesQuotes.filter((q) => q.data.customerId === customerId),
    [salesQuotes, customerId],
  );

  const total = rows.length;
  const won = rows.filter((r) => r.data.quoteStatus === "won").length;
  const lost = rows.filter((r) => r.data.quoteStatus === "lost").length;
  const open = rows.filter((r) => OPEN_STATUSES.includes(r.data.quoteStatus ?? ""));
  const conversion = total > 0 ? Math.round((won / total) * 100) : 0;
  const wonRevenue = rows
    .filter((r) => r.data.quoteStatus === "won")
    .reduce((sum, r) => sum + computeTotals(r.data).selling, 0);
  const pipelineValue = open.reduce((sum, r) => sum + computeTotals(r.data).selling, 0);

  const statusPill = (key: string | undefined) => {
    const s = QUOTE_STATUS_MAP[key ?? ""];
    return s ? (
      <span className="rounded-xl text-[11px] font-medium px-2.5 py-0.5" style={{ backgroundColor: s.color.bg, color: s.color.text }}>
        {s.label}
      </span>
    ) : (
      <span className="text-slate-300">—</span>
    );
  };

  const columns: ColumnsType<SalesQuote> = [
    {
      title: "Reference",
      dataIndex: "quoteNumber",
      key: "quoteNumber",
      render: (v: string) => <span className="font-mono text-indigo-600">{v}</span>,
    },
    { title: "Status", key: "status", render: (_: unknown, r) => statusPill(r.data.quoteStatus) },
    { title: "Service", key: "svc", render: (_: unknown, r) => r.data.serviceType || "—" },
    {
      title: "Route",
      key: "route",
      render: (_: unknown, r) =>
        r.data.origin || r.data.destination ? `${r.data.origin || "—"} → ${r.data.destination || "—"}` : "—",
    },
    {
      title: "Valid until",
      key: "valid",
      render: (_: unknown, r) => {
        const v = validityInfo(r.data);
        if (!v.date) return "—";
        return <span className={v.expired ? "text-red-600" : undefined}>{v.date}{v.expired ? " (expired)" : ""}</span>;
      },
    },
    {
      title: "Selling",
      key: "selling",
      align: "right",
      render: (_: unknown, r) => {
        const t = computeTotals(r.data);
        return t.selling ? fmt(t.selling, r.data.currency) : "—";
      },
    },
    { title: "Created", dataIndex: "createdAt", key: "created", render: (v: string) => v?.slice(0, 10) ?? "—" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total" value={total} />
        <KpiCard label="Won" value={won} tone="green" />
        <KpiCard label="Lost" value={lost} tone="red" />
        <KpiCard label="Open" value={open.length} tone="amber" />
        <KpiCard label="Conversion" value={`${conversion}%`} />
        <KpiCard label="Won Revenue" value={fmt(wonRevenue)} tone="green" />
      </div>

      <SectionCard
        title="Pipeline — Open Quotes"
        extra={
          <span className="text-sm font-semibold text-slate-800">
            Pipeline value: {fmt(pipelineValue)}
          </span>
        }
      >
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spin />
          </div>
        ) : open.length === 0 ? (
          <div className="text-sm text-slate-400 py-2">No open quotes.</div>
        ) : (
          <div className="flex flex-col divide-y divide-slate-100">
            {open.map((r) => {
              const t = computeTotals(r.data);
              return (
                <button
                  key={r.quoteNumber}
                  type="button"
                  className="flex items-center justify-between py-2 text-left hover:bg-slate-50"
                  onClick={() => router.push(`/sales/quote/${r.quoteNumber}`)}
                >
                  <span className="font-mono text-sm text-indigo-600">{r.quoteNumber}</span>
                  <span className="flex items-center gap-3">
                    {statusPill(r.data.quoteStatus)}
                    <span className="text-sm font-medium text-slate-800">{fmt(t.selling, r.data.currency)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="All Quotes">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spin />
          </div>
        ) : (
          <Table<SalesQuote>
            rowKey="quoteNumber"
            size="small"
            columns={columns}
            dataSource={rows}
            pagination={false}
            scroll={{ x: true }}
            onRow={(record) => ({ onClick: () => router.push(`/sales/quote/${record.quoteNumber}`), className: "cursor-pointer" })}
          />
        )}
      </SectionCard>
    </div>
  );
}
