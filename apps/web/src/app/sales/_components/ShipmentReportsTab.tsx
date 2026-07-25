"use client";

import { useMemo, useState } from "react";
import { Input } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { useShipments } from "@/hooks/useShipments";
import { fmt } from "@/app/sales/_lib/salesQuote";
import { DataTable } from "@/components/DataTable";
import { StatusBadge } from "@/components/StatusBadge";

type Row = {
  id: string;
  jobNumber: string;
  customer: string;
  freightMode: string;
  status: string;
  selling: string;
  buying: string;
};

const parseNum = (v: string): number => {
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
};

export function ShipmentReportsTab() {
  const { shipments, isLoading } = useShipments();
  const [search, setSearch] = useState("");

  const rows = useMemo<Row[]>(() => {
    const term = search.trim().toLowerCase();
    return shipments
      .map((s): Row => ({
        id: s.id,
        jobNumber: s.jobNumber,
        customer: s.customer,
        freightMode: s.freightMode,
        status: s.status,
        selling: s.selling,
        buying: s.buying,
      }))
      .filter((r) => {
        if (!term) return true;
        return (
          r.jobNumber.toLowerCase().includes(term) ||
          r.customer.toLowerCase().includes(term)
        );
      });
  }, [shipments, search]);

  const totals = useMemo(() => {
    let revenue = 0;
    let margin = 0;
    for (const r of rows) {
      const selling = parseNum(r.selling);
      revenue += selling;
      margin += selling - parseNum(r.buying);
    }
    return { count: rows.length, revenue, margin };
  }, [rows]);

  const columns: ColumnsType<Row> = [
    {
      title: "Job #",
      dataIndex: "jobNumber",
      render: (v: string) => (
        <span className="font-mono text-xs text-indigo-500">{v}</span>
      ),
    },
    {
      title: "Customer",
      dataIndex: "customer",
      render: (v: string) => v || <span className="text-slate-300">—</span>,
    },
    {
      title: "Mode",
      dataIndex: "freightMode",
      render: (v: string) => v || <span className="text-slate-300">—</span>,
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (v: string) => <StatusBadge status={v} />,
    },
    {
      title: "Revenue",
      dataIndex: "selling",
      align: "right",
      render: (_: unknown, record) => fmt(parseNum(record.selling), "CZK"),
    },
    {
      title: "Margin",
      key: "margin",
      align: "right",
      render: (_: unknown, record) => {
        const m = parseNum(record.selling) - parseNum(record.buying);
        return (
          <span className={m >= 0 ? "text-green-600" : "text-red-600"}>
            {fmt(m, "CZK")}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <span className="block text-sm font-semibold text-slate-800 mb-3">
        Shipment Reports
      </span>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            Total shipments
          </div>
          <div className="text-lg font-semibold text-slate-800">
            {totals.count}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            Total revenue
          </div>
          <div className="text-lg font-semibold text-slate-800">
            {fmt(totals.revenue, "CZK")}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">
            Total margin
          </div>
          <div
            className={
              "text-lg font-semibold " +
              (totals.margin >= 0 ? "text-green-600" : "text-red-600")
            }
          >
            {fmt(totals.margin, "CZK")}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder="Search by job # or customer"
          allowClear
          className="max-w-xs"
        />
      </div>

      <DataTable<Row>
        dataSource={rows}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        scroll={{ x: "max-content" }}
        resetKey={search}
      />
    </div>
  );
}
