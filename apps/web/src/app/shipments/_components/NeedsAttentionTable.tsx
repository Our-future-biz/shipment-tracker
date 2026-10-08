"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Table, Tag } from "antd";
import { DownOutlined, RightOutlined, WarningFilled } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { COLUMN_MAP } from "@/lib/columnConfig";
import { formatDate } from "@/lib/date";
import { useShipmentsNeedingAttention } from "@/hooks/useShipmentsNeedingAttention";
import type { ShipmentDueItem } from "@/hooks/useShipmentsNeedingAttention";

const DAY_LABELS = ["today", "tomorrow", "in 2 days"];
const DAY_COLORS = ["red", "orange", "gold"];

// Shipments with a deadline coming up, listed above the grid so they cannot be missed:
// one table for what is due within 24 hours, one for within 48 hours. Always shown, so
// empty tables read as "all clear".
export function NeedsAttentionTable() {
  const router = useRouter();
  const { within24h, within48h, isLoading } = useShipmentsNeedingAttention();
  const [open, setOpen] = useState(true);

  const urgent = within24h.length > 0;

  const columnsFor = (dueTitle: string): ColumnsType<ShipmentDueItem> => [
    {
      title: "Internal Reference",
      dataIndex: "jobNumber",
      width: 170,
      render: (v: string) => <span className="font-mono font-semibold text-indigo-600">{v}</span>,
    },
    {
      title: dueTitle,
      dataIndex: "deadlines",
      render: (_: unknown, r) => (
        <div className="flex flex-wrap gap-1.5">
          {r.deadlines.map((d) => (
            <Tag key={d.field} color={DAY_COLORS[d.daysLeft]} className="m-0">
              {COLUMN_MAP.get(d.field)?.title ?? d.field}: {DAY_LABELS[d.daysLeft]} ({formatDate(d.date)})
            </Tag>
          ))}
        </div>
      ),
    },
  ];

  const renderTable = (dueTitle: string, shipments: ShipmentDueItem[], emptyText: string) => (
    <Table<ShipmentDueItem>
      size="small"
      rowKey="id"
      loading={isLoading}
      locale={{ emptyText }}
      dataSource={shipments}
      columns={columnsFor(dueTitle)}
      pagination={{ pageSize: 10, hideOnSinglePage: true, size: "small" }}
      rowClassName="cursor-pointer"
      onRow={(r) => ({ onClick: () => router.push(`/shipments/${r.id}`) })}
    />
  );

  return (
    <section className={`bg-white border rounded-2xl overflow-hidden ${urgent ? "border-red-200" : "border-slate-200"}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-2 px-4 py-2.5 border-none text-left cursor-pointer ${urgent ? "bg-red-50" : "bg-slate-50"}`}
      >
        <WarningFilled className={urgent ? "text-red-500" : "text-slate-300"} />
        <span className="text-[13px] font-bold uppercase tracking-wider text-slate-800">Needs Attention</span>
        <span className="text-[13px] text-slate-600">
          {within24h.length} within 24 hours · {within48h.length} within 48 hours
        </span>
        <span className="ml-auto text-xs text-slate-500">{open ? <DownOutlined /> : <RightOutlined />}</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-slate-200">
          {renderTable("Due within 24 hours", within24h, "Nothing due within 24 hours.")}
          {renderTable("Due within 48 hours", within48h, "Nothing due within 48 hours.")}
        </div>
      )}
    </section>
  );
}
