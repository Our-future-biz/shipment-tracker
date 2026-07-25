"use client";

import { useMemo } from "react";
import { Table, Spin } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useSalesQuotes } from "@/hooks/useSalesQuotes";
import { computeTotals, fmt } from "@/app/sales/_lib/salesQuote";
import { QUOTE_STATUS_MAP } from "@/app/sales/_lib/types";

interface Kpi {
  label: string;
  value: string;
}

interface ServiceRow {
  serviceType: string;
  quotes: number;
  won: number;
  selling: number;
  profit: number;
  avgMargin: number;
}

interface StatusRow {
  status: string;
  count: number;
  selling: number;
}

interface OwnerRow {
  owner: string;
  quotes: number;
  won: number;
  lost: number;
  selling: number;
  avgMargin: number;
  conversion: number;
}

export function SalesReportTab() {
  const { salesQuotes, isLoading } = useSalesQuotes();

  const kpis = useMemo<Kpi[]>(() => {
    const total = salesQuotes.length;
    const won = salesQuotes.filter((q) => q.data.quoteStatus === "won");
    const lost = salesQuotes.filter((q) => q.data.quoteStatus === "lost");
    const wonRevenue = won.reduce((sum, q) => sum + computeTotals(q.data).selling, 0);
    const avgMargin = total
      ? Math.round(salesQuotes.reduce((sum, q) => sum + computeTotals(q.data).margin, 0) / total)
      : 0;
    const decided = won.length + lost.length;
    const conversion = decided ? Math.round((won.length / decided) * 100) : 0;
    return [
      { label: "Total Quotes", value: String(total) },
      { label: "Won", value: String(won.length) },
      { label: "Lost", value: String(lost.length) },
      { label: "Revenue (Won)", value: fmt(wonRevenue) },
      { label: "Avg Margin", value: `${avgMargin}%` },
      { label: "Conversion", value: `${conversion}%` },
    ];
  }, [salesQuotes]);

  const serviceRows = useMemo<ServiceRow[]>(() => {
    const groups = new Map<string, ServiceRow>();
    for (const q of salesQuotes) {
      const key = q.data.serviceType || "Unspecified";
      const totals = computeTotals(q.data);
      const row =
        groups.get(key) ??
        { serviceType: key, quotes: 0, won: 0, selling: 0, profit: 0, avgMargin: 0 };
      row.quotes += 1;
      if (q.data.quoteStatus === "won") row.won += 1;
      row.selling += totals.selling;
      row.profit += totals.profit;
      row.avgMargin += totals.margin;
      groups.set(key, row);
    }
    return [...groups.values()].map((r) => ({
      ...r,
      avgMargin: r.quotes ? Math.round(r.avgMargin / r.quotes) : 0,
    }));
  }, [salesQuotes]);

  const statusRows = useMemo<StatusRow[]>(() => {
    const groups = new Map<string, StatusRow>();
    for (const q of salesQuotes) {
      const key = q.data.quoteStatus || "unspecified";
      const totals = computeTotals(q.data);
      const row = groups.get(key) ?? { status: key, count: 0, selling: 0 };
      row.count += 1;
      row.selling += totals.selling;
      groups.set(key, row);
    }
    return [...groups.values()];
  }, [salesQuotes]);

  const ownerRows = useMemo<OwnerRow[]>(() => {
    const groups = new Map<string, OwnerRow & { marginSum: number }>();
    for (const q of salesQuotes) {
      const key = q.data.salesOwner || "Unassigned";
      const totals = computeTotals(q.data);
      const row = groups.get(key) ?? { owner: key, quotes: 0, won: 0, lost: 0, selling: 0, avgMargin: 0, conversion: 0, marginSum: 0 };
      row.quotes += 1;
      if (q.data.quoteStatus === "won") row.won += 1;
      if (q.data.quoteStatus === "lost") row.lost += 1;
      row.selling += totals.selling;
      row.marginSum += totals.margin;
      groups.set(key, row);
    }
    return [...groups.values()].map((r) => {
      const decided = r.won + r.lost;
      return {
        owner: r.owner,
        quotes: r.quotes,
        won: r.won,
        lost: r.lost,
        selling: r.selling,
        avgMargin: r.quotes ? Math.round(r.marginSum / r.quotes) : 0,
        conversion: decided ? Math.round((r.won / decided) * 100) : 0,
      };
    });
  }, [salesQuotes]);

  const ownerColumns: ColumnsType<OwnerRow> = [
    { title: "Sales Owner", dataIndex: "owner", render: (v: string) => <span className="font-medium text-slate-700">{v}</span> },
    { title: "Quotes", dataIndex: "quotes" },
    { title: "Won", dataIndex: "won" },
    { title: "Lost", dataIndex: "lost" },
    { title: "Revenue", dataIndex: "selling", align: "right", render: (v: number) => fmt(v) },
    { title: "Avg Margin", dataIndex: "avgMargin", align: "right", render: (v: number) => `${v}%` },
    { title: "Conversion", dataIndex: "conversion", align: "right", render: (v: number) => `${v}%` },
  ];

  const serviceColumns: ColumnsType<ServiceRow> = [
    {
      title: "Service Type",
      dataIndex: "serviceType",
      render: (v: string) => <span className="font-medium text-slate-700">{v}</span>,
    },
    { title: "Quotes", dataIndex: "quotes" },
    { title: "Won", dataIndex: "won" },
    { title: "Selling", dataIndex: "selling", align: "right", render: (v: number) => fmt(v) },
    { title: "Profit", dataIndex: "profit", align: "right", render: (v: number) => fmt(v) },
    { title: "Avg Margin", dataIndex: "avgMargin", align: "right", render: (v: number) => `${v}%` },
  ];

  const statusColumns: ColumnsType<StatusRow> = [
    {
      title: "Status",
      dataIndex: "status",
      render: (v: string) => {
        const def = QUOTE_STATUS_MAP[v];
        return (
          <span className="text-slate-700">
            <span
              className="inline-block w-2 h-2 rounded-full mr-1.5"
              style={{ backgroundColor: def?.color.text }}
            />
            {def?.label ?? v}
          </span>
        );
      },
    },
    { title: "Count", dataIndex: "count" },
    { title: "Selling", dataIndex: "selling", align: "right", render: (v: number) => fmt(v) },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spin />
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
