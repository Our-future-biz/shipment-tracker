"use client";

import { useMemo } from "react";
import { Table, Spin } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { KpiCard, SectionCard, CHART_COLORS } from "./shared";
import { useCustomer } from "@/hooks/useCustomers";
import { useCustomerShipments } from "@/hooks/useCustomerShipments";
import type { ShipmentItem } from "@/hooks/useCustomerShipments";
import { fmtMoney, marginPct } from "@/app/customers/_lib/constants";

const num = (v: string | null | undefined): number => {
  const n = parseFloat(v ?? "");
  return Number.isNaN(n) ? 0 : n;
};

type MonthRow = { month: string; revenue: number; cost: number; profit: number };

type ShipmentRow = {
  id: string;
  jobNumber: string;
  route: string;
  status: string;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
};

export function FinancialSection({ customerId }: { customerId: string }) {
  const { customer } = useCustomer(customerId);
  const { shipments, isLoading } = useCustomerShipments(customerId);
  const currency = customer?.currency;

  const totals = useMemo(() => {
    let revenue = 0;
    let cost = 0;
    for (const s of shipments) {
      revenue += num(s.selling);
      cost += num(s.buying);
    }
    const profit = revenue - cost;
    const count = shipments.length;
    return {
      revenue,
      cost,
      profit,
      count,
      margin: marginPct(revenue, profit),
      avgProfit: count > 0 ? profit / count : 0,
    };
  }, [shipments]);

  const monthly = useMemo<MonthRow[]>(() => {
    const map = new Map<string, MonthRow>();
    for (const s of shipments) {
      const raw = s.estimatedArrival || s.createdAt.slice(0, 10);
      const month = raw.slice(0, 7);
      if (!month) continue;
      const revenue = num(s.selling);
      const cost = num(s.buying);
      const bucket = map.get(month) ?? { month, revenue: 0, cost: 0, profit: 0 };
      bucket.revenue += revenue;
      bucket.cost += cost;
      bucket.profit += revenue - cost;
      map.set(month, bucket);
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [shipments]);

  const donutData = useMemo(
    () => [
      { name: "Profit", value: totals.profit },
      { name: "Cost", value: totals.cost },
    ],
    [totals.profit, totals.cost],
  );

  const rows = useMemo<ShipmentRow[]>(
    () =>
      shipments.map((s: ShipmentItem) => {
        const revenue = num(s.selling);
        const cost = num(s.buying);
        const profit = revenue - cost;
        return {
          id: s.id,
          jobNumber: s.jobNumber,
          route: `${s.pol || "?"} → ${s.pod || "?"}`,
          status: s.status,
          revenue,
          cost,
          profit,
          margin: marginPct(revenue, profit),
        };
      }),
    [shipments],
  );

  const columns: ColumnsType<ShipmentRow> = [
    {
      title: "Job #",
      dataIndex: "jobNumber",
      key: "jobNumber",
      render: (v: string) => <span className="font-mono text-xs">{v}</span>,
    },
    { title: "Route", dataIndex: "route", key: "route" },
    { title: "Status", dataIndex: "status", key: "status" },
    {
      title: "Revenue",
      dataIndex: "revenue",
      key: "revenue",
      align: "right",
      render: (v: number) => fmtMoney(v, currency),
    },
    {
      title: "Cost",
      dataIndex: "cost",
      key: "cost",
      align: "right",
      render: (v: number) => fmtMoney(v, currency),
    },
    {
      title: "Profit",
      dataIndex: "profit",
      key: "profit",
      align: "right",
      render: (v: number) => (
        <span className={v >= 0 ? "text-green-600" : "text-red-600"}>{fmtMoney(v, currency)}</span>
      ),
    },
    {
      title: "Margin %",
      dataIndex: "margin",
      key: "margin",
      align: "right",
      render: (v: number) => `${v}%`,
    },
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spin />
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-6 gap-3 mb-4">
        <KpiCard label="Total Revenue" value={fmtMoney(totals.revenue, currency)} />
        <KpiCard label="Total Profit" value={fmtMoney(totals.profit, currency)} tone="green" />
        <KpiCard label="Total Cost" value={fmtMoney(totals.cost, currency)} />
        <KpiCard label="Margin %" value={`${totals.margin}%`} />
        <KpiCard label="Shipments" value={totals.count} />
        <KpiCard label="Avg Profit / Shipment" value={fmtMoney(totals.avgProfit, currency)} tone="green" />
      </div>

      <div className="mb-4">
        <SectionCard title="Revenue vs Cost vs Profit — Monthly">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="revenue" name="Revenue" fill={CHART_COLORS.revenue} />
              <Bar dataKey="cost" name="Cost" fill={CHART_COLORS.cost} />
              <Bar dataKey="profit" name="Profit" fill={CHART_COLORS.profit} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <SectionCard title="Revenue breakdown">
          <div className="relative">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80}>
                  <Cell fill={CHART_COLORS.profit} />
                  <Cell fill={CHART_COLORS.cost} />
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-2xl font-bold text-slate-800">{totals.margin}%</div>
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Margin</div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Profit Trend">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="profit" name="Profit" stroke={CHART_COLORS.profit} />
            </LineChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      <SectionCard title="Shipment transactions">
        <Table<ShipmentRow>
          size="small"
          rowKey="id"
          columns={columns}
          dataSource={rows}
          pagination={false}
        />
      </SectionCard>
    </div>
  );
}
