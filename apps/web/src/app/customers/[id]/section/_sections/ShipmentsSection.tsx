"use client";

import { Table, Spin, Input, Select } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState, useMemo } from "react";
import { KpiCard, SectionCard } from "./shared";
import { fmtMoney } from "@/app/customers/_lib/constants";
import { useCustomer } from "@/hooks/useCustomers";
import { useCustomerShipments } from "@/hooks/useCustomerShipments";

const num = (v: string | null | undefined): number => {
  const n = parseFloat(v ?? "");
  return Number.isNaN(n) ? 0 : n;
};

interface ShipmentRow {
  id: string;
  jobNumber: string;
  freightMode: string;
  tradeDirection: string;
  status: string;
  pol: string;
  pod: string;
  estimatedDeparture: string | null;
  estimatedArrival: string | null;
  revenue: number;
  cost: number;
  profit: number;
}

export function ShipmentsSection({ customerId }: { customerId: string }) {
  const { customer } = useCustomer(customerId);
  const { shipments, isLoading } = useCustomerShipments(customerId);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [modeFilter, setModeFilter] = useState("All");
  const [directionFilter, setDirectionFilter] = useState("All");

  const rows = useMemo<ShipmentRow[]>(
    () =>
      shipments.map((s) => {
        const revenue = num(s.selling);
        const cost = num(s.buying);
        return {
          id: s.id,
          jobNumber: s.jobNumber,
          freightMode: s.freightMode,
          tradeDirection: s.tradeDirection,
          status: s.status,
          pol: s.pol,
          pod: s.pod,
          estimatedDeparture: s.estimatedDeparture,
          estimatedArrival: s.estimatedArrival,
          revenue,
          cost,
          profit: revenue - cost,
        };
      }),
    [shipments],
  );

  const total = rows.length;
  const active = rows.filter((r) => r.status !== "Completed" && r.status !== "Pending").length;
  const completed = rows.filter((r) => r.status === "Completed").length;
  const pending = rows.filter((r) => r.status === "Pending").length;
  const revenue = rows.reduce((sum, r) => sum + r.revenue, 0);
  const realisedProfit = rows.filter((r) => r.status === "Completed").reduce((sum, r) => sum + r.profit, 0);

  const statusOptions = useMemo(() => {
    const unique = Array.from(new Set(rows.map((r) => r.status).filter(Boolean)));
    return ["All", ...unique];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = `${r.jobNumber} ${r.pol} ${r.pod}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter !== "All" && r.status !== statusFilter) return false;
      if (modeFilter !== "All" && r.freightMode !== modeFilter) return false;
      if (directionFilter !== "All" && r.tradeDirection !== directionFilter) return false;
      return true;
    });
  }, [rows, search, statusFilter, modeFilter, directionFilter]);

  const columns: ColumnsType<ShipmentRow> = [
    {
      title: "Job #",
      dataIndex: "jobNumber",
      key: "jobNumber",
      render: (v: string) => <span className="font-mono text-indigo-600">{v}</span>,
    },
    { title: "Mode", dataIndex: "freightMode", key: "freightMode" },
    { title: "Direction", dataIndex: "tradeDirection", key: "tradeDirection" },
    {
      title: "Route",
      key: "route",
      render: (_: unknown, r: ShipmentRow) => (
        <span className="text-slate-600">
          {r.pol || "—"} → {r.pod || "—"}
        </span>
      ),
    },
    { title: "Status", dataIndex: "status", key: "status" },
    {
      title: "ETD",
      dataIndex: "estimatedDeparture",
      key: "estimatedDeparture",
      render: (v: string | null) => v ?? "—",
    },
    {
      title: "ETA",
      dataIndex: "estimatedArrival",
      key: "estimatedArrival",
      render: (v: string | null) => v ?? "—",
    },
    {
      title: "Revenue",
      dataIndex: "revenue",
      key: "revenue",
      align: "right",
      render: (v: number) => fmtMoney(v, customer?.currency),
    },
    {
      title: "Cost",
      dataIndex: "cost",
      key: "cost",
      align: "right",
      render: (v: number) => fmtMoney(v, customer?.currency),
    },
    {
      title: "Profit",
      dataIndex: "profit",
      key: "profit",
      align: "right",
      render: (v: number) => (
        <span className={v >= 0 ? "text-green-600" : "text-red-600"}>{fmtMoney(v, customer?.currency)}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total" value={total} />
        <KpiCard label="Active" value={active} tone="amber" />
        <KpiCard label="Completed" value={completed} tone="green" />
        <KpiCard label="Pending" value={pending} />
        <KpiCard label="Revenue" value={fmtMoney(revenue, customer?.currency)} />
        <KpiCard label="Realised Profit" value={fmtMoney(realisedProfit, customer?.currency)} tone="green" />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
        <Input
          allowClear
          placeholder="Search job #, POL, POD"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          className="min-w-[140px]"
          options={statusOptions.map((s) => ({ label: s === "All" ? "All Statuses" : s, value: s }))}
        />
        <Select
          value={modeFilter}
          onChange={setModeFilter}
          className="min-w-[120px]"
          options={["All", "AIR", "SEA", "ROAD", "RAIL"].map((m) => ({
            label: m === "All" ? "All Modes" : m,
            value: m,
          }))}
        />
        <Select
          value={directionFilter}
          onChange={setDirectionFilter}
          className="min-w-[130px]"
          options={["All", "IMPORT", "EXPORT"].map((d) => ({
            label: d === "All" ? "All Directions" : d,
            value: d,
          }))}
        />
        <span className="text-sm text-slate-500 ml-auto">{filtered.length} shipments</span>
      </div>

      <SectionCard title="Shipments">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spin />
          </div>
        ) : (
          <Table<ShipmentRow>
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={filtered}
            pagination={false}
            scroll={{ x: true }}
          />
        )}
      </SectionCard>
    </div>
  );
}
