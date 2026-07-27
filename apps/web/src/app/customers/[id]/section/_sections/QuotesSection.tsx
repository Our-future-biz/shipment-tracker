"use client";

import { Table, Spin, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo } from "react";
import { KpiCard, SectionCard } from "./shared";
import { fmtMoney } from "@/app/customers/_lib/constants";
import { useCustomer } from "@/hooks/useCustomers";
import { useQuotes } from "@/hooks/useQuotes";

const asData = (d: unknown): Record<string, unknown> =>
  d && typeof d === "object" ? (d as Record<string, unknown>) : {};

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

const num = (v: unknown): number => Number(v) || 0;

interface QuoteRow {
  key: string;
  quoteNumber: string;
  status: string;
  revenue: number;
  validUntil: string;
  description: string;
}

const STATUS_COLOR: Record<string, string> = {
  Pending: "gold",
  Won: "green",
  Lost: "red",
};

export function QuotesSection({ customerId }: { customerId: string }) {
  const { customer } = useCustomer(customerId);
  const { quotes, isLoading } = useQuotes();

  const rows = useMemo<QuoteRow[]>(
    () =>
      quotes
        .filter((q) => asData(q.data).customerId === customerId)
        .map((q) => {
          const data = asData(q.data);
          return {
            key: q.quoteNumber,
            quoteNumber: q.quoteNumber,
            status: str(data.status),
            revenue: num(data.revenue),
            validUntil: str(data.validUntil),
            description: str(data.description),
          };
        }),
    [quotes, customerId],
  );

  const total = rows.length;
  const won = rows.filter((r) => r.status === "Won").length;
  const lost = rows.filter((r) => r.status === "Lost").length;
  const pending = rows.filter((r) => r.status === "Pending" || r.status === "");
  const pendingCount = pending.length;
  const conversion = total > 0 ? Math.round((won / total) * 100) : 0;
  const wonRevenue = rows.filter((r) => r.status === "Won").reduce((sum, r) => sum + r.revenue, 0);
  const pipelineValue = pending.reduce((sum, r) => sum + r.revenue, 0);

  const columns: ColumnsType<QuoteRow> = [
    {
      title: "Reference",
      dataIndex: "quoteNumber",
      key: "quoteNumber",
      render: (v: string) => <span className="font-mono text-indigo-600">{v}</span>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (v: string) => (v ? <Tag color={STATUS_COLOR[v] ?? "default"}>{v}</Tag> : <Tag color="gold">Pending</Tag>),
    },
    {
      title: "Valid until",
      dataIndex: "validUntil",
      key: "validUntil",
      render: (v: string) => v || "—",
    },
    {
      title: "Revenue",
      dataIndex: "revenue",
      key: "revenue",
      align: "right",
      render: (v: number) => fmtMoney(v, customer?.currency),
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
      render: (v: string) => <span className="text-slate-600">{v || "—"}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total" value={total} />
        <KpiCard label="Won" value={won} tone="green" />
        <KpiCard label="Lost" value={lost} tone="red" />
        <KpiCard label="Pending" value={pendingCount} tone="amber" />
        <KpiCard label="Conversion" value={`${conversion}%`} />
        <KpiCard label="Won Revenue" value={fmtMoney(wonRevenue, customer?.currency)} tone="green" />
      </div>

      <SectionCard
        title="Pipeline — Open Quotes"
        extra={
          <span className="text-sm font-semibold text-slate-800">
            Pipeline value: {fmtMoney(pipelineValue, customer?.currency)}
          </span>
        }
      >
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spin />
          </div>
        ) : pending.length === 0 ? (
          <div className="text-sm text-slate-400 py-2">No open quotes.</div>
        ) : (
          <div className="flex flex-col divide-y divide-slate-100">
            {pending.map((r) => (
              <div key={r.key} className="flex items-center justify-between py-2">
                <span className="font-mono text-sm text-indigo-600">{r.quoteNumber}</span>
                <span className="text-sm font-medium text-slate-800">{fmtMoney(r.revenue, customer?.currency)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="All Quotes">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spin />
          </div>
        ) : (
          <Table<QuoteRow>
            rowKey="key"
            size="small"
            columns={columns}
            dataSource={rows}
            pagination={false}
            scroll={{ x: true }}
          />
        )}
      </SectionCard>
    </div>
  );
}
