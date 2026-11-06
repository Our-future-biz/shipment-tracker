"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Table, Tag } from "antd";
import { WarningFilled } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { PillTabs } from "@/components/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { useTrackingAttention, type TrackingAttentionItem } from "@/hooks/useTrackingAttention";
import { CARD_TITLE, EMPTY, HINT, MODAL_TITLE, REF } from "@/styles/ui";

const VISIBLE_ROWS = 3;

type Area = "all" | "tracking" | "finance";
const AREAS: readonly { key: Area; label: string }[] = [
  { key: "all", label: "All" },
  { key: "tracking", label: "Tracking" },
  { key: "finance", label: "Billing" },
];

const dash = <span className={EMPTY}>—</span>;

const referenceColumn = {
  title: "Internal Reference",
  dataIndex: "jobNumber",
  width: 170,
  render: (v: string) => <span className={`${REF} font-semibold text-indigo-600`}>{v}</span>,
};

const flagsColumn = {
  title: "What",
  dataIndex: "flags",
  render: (_: unknown, r: TrackingAttentionItem) => (
    <div className="flex flex-wrap gap-1.5">
      {r.flags.map((f, i) => (
        <Tag key={`${f.kind}-${i}`} color={f.severity === "urgent" ? "red" : "orange"} className="m-0 whitespace-normal">
          {f.label}: {f.detail}
        </Tag>
      ))}
    </div>
  ),
};

const CARD_COLUMNS: ColumnsType<TrackingAttentionItem> = [referenceColumn, flagsColumn];
const DIALOG_COLUMNS: ColumnsType<TrackingAttentionItem> = [
  referenceColumn,
  { title: "Customer", dataIndex: "customer", render: (v: string) => v || dash },
  { title: "Direction", dataIndex: "tradeDirection", width: 100, render: (v: string) => v || dash },
  { title: "Status", dataIndex: "status", render: (v: string) => (v ? <StatusBadge status={v} /> : dash) },
  flagsColumn,
];

/**
 * What the shipments' dates say needs chasing, beside the deadlines coming up: a date that passed
 * with nothing recorded, a date to confirm, a customer not told, a job not billed. A row opens the
 * shipment's Tracking tab.
 */
export function TrackingAttentionCard() {
  const router = useRouter();
  const { items, capped, isLoading, isError } = useTrackingAttention();
  const [open, setOpen] = useState(false);
  const [area, setArea] = useState<Area>("all");

  const rowProps = (r: TrackingAttentionItem) => ({ onClick: () => router.push(`/shipments/${r.id}?tab=tracking`) });
  const urgent = items.some((i) => i.flags.some((f) => f.severity === "urgent"));
  const tone = items.length === 0 ? null : urgent ? { border: "border-red-200", header: "bg-red-50", icon: "text-red-500", link: "text-red-600" } : { border: "border-amber-200", header: "bg-amber-50", icon: "text-amber-500", link: "text-amber-600" };
  const shown =
    area === "all"
      ? items
      : items.flatMap((i) => {
          const flags = i.flags.filter((f) => f.area === area);
          return flags.length ? [{ ...i, flags }] : [];
        });

  return (
    <>
      <section className={`bg-white border rounded-xl shadow-sm overflow-hidden ${tone?.border ?? "border-slate-200"}`}>
        <div className={`flex items-center gap-2.5 min-h-[42px] px-4 py-2 ${tone?.header ?? "bg-slate-50"}`}>
          <WarningFilled className={tone?.icon ?? "text-slate-300"} />
          <h3 className={CARD_TITLE}>Tracking and billing</h3>
          <span
            aria-label={isError ? "Count unavailable" : `${items.length} shipments`}
            className={`min-w-6 h-6 px-1.5 rounded-full flex items-center justify-center bg-white text-[13px] font-bold tabular-nums ${tone?.link ?? "text-slate-500"}`}
          >
            {isError ? "–" : items.length}
          </span>
          <span className="text-[13px] text-slate-500">dates passed, not told, not billed</span>
        </div>
        <Table<TrackingAttentionItem>
          size="small"
          rowKey="id"
          showHeader={false}
          loading={isLoading}
          locale={{
            emptyText: isError ? <span className="text-[13px] text-red-600">Could not load this list.</span> : <span className="text-[13px] text-slate-500">Nothing to chase.</span>,
          }}
          footer={
            items.length > 0
              ? () => (
                  <button type="button" onClick={() => setOpen(true)} className={`p-0 border-none bg-transparent text-[13px] font-semibold cursor-pointer hover:underline ${tone?.link ?? ""}`}>
                    Show all {items.length}
                  </button>
                )
              : undefined
          }
          dataSource={items.slice(0, VISIBLE_ROWS)}
          columns={CARD_COLUMNS}
          pagination={false}
          rowClassName="cursor-pointer"
          onRow={rowProps}
        />
      </section>

      <Modal open={open} onCancel={() => setOpen(false)} title={<span className={MODAL_TITLE}>Tracking and billing</span>} footer={null} width={1100} centered>
        <div className="space-y-3">
          <PillTabs tabs={AREAS} active={area} onChange={setArea} />
          {capped && <p className={`${HINT} m-0`}>Looks at the newest 1,000 active shipments.</p>}
          <div className="overflow-x-auto">
            <Table<TrackingAttentionItem> size="small" rowKey="id" dataSource={shown} columns={DIALOG_COLUMNS} pagination={{ pageSize: 25, hideOnSinglePage: true }} rowClassName="cursor-pointer" onRow={rowProps} />
          </div>
        </div>
      </Modal>
    </>
  );
}
