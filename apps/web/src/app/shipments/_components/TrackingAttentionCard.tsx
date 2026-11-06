"use client";

import { useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { AppModal } from "@/components/AppModal";
import { Pill } from "@/components/Pill";
import { PillTabs, SectionCard } from "@/components/SectionCard";
import { StatusBadge } from "@/components/StatusBadge";
import { useTrackingAttention, type TrackingAttentionItem } from "@/hooks/useTrackingAttention";
import { EMPTY, HINT, LINK, REF } from "@/styles/ui";

const VISIBLE_ROWS = 3;

type Area = "all" | "tracking" | "finance";
const AREAS: readonly { key: Area; label: string }[] = [
  { key: "all", label: "All" },
  { key: "tracking", label: "Tracking" },
  { key: "finance", label: "Billing" },
];

const dash = <span className={EMPTY}>—</span>;

// A row is a way into the shipment: it shows where the keyboard is.
const ROW_CLASS = "cursor-pointer outline-none focus-visible:[&>td]:!bg-indigo-50";

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
        <Pill key={`${f.kind}-${i}`} tone={f.severity === "urgent" ? "red" : "amber"} className="!whitespace-normal">
          {f.label}: {f.detail}
        </Pill>
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

  // A row opens with a click, and from the keyboard with Enter or Space.
  const rowProps = (r: TrackingAttentionItem) => {
    const openRow = () => router.push(`/shipments/${r.id}?tab=tracking`);
    return {
      onClick: openRow,
      tabIndex: 0,
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        openRow();
      },
    };
  };
  const urgent = items.some((i) => i.flags.some((f) => f.severity === "urgent"));
  const shown =
    area === "all"
      ? items
      : items.flatMap((i) => {
          const flags = i.flags.filter((f) => f.area === area);
          return flags.length ? [{ ...i, flags }] : [];
        });

  return (
    <>
      <SectionCard
        title="Tracking and billing"
        bodyClassName="p-0 overflow-hidden rounded-b-xl"
        extra={
          <>
            <span className={`${HINT} hidden sm:inline`}>dates passed, not told, not billed</span>
            <Pill tone={isError || items.length === 0 ? "slate" : urgent ? "red" : "amber"} aria-label={isError ? "Count unavailable" : `${items.length} shipments`} className="tabular-nums">
              {isError ? "–" : items.length}
            </Pill>
          </>
        }
      >
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
                  <button type="button" onClick={() => setOpen(true)} className={`${LINK} p-0 border-none bg-transparent text-[13px] font-semibold cursor-pointer`}>
                    Show all {items.length}
                  </button>
                )
              : undefined
          }
          dataSource={items.slice(0, VISIBLE_ROWS)}
          columns={CARD_COLUMNS}
          pagination={false}
          rowClassName={ROW_CLASS}
          onRow={rowProps}
        />
      </SectionCard>

      <AppModal open={open} onClose={() => setOpen(false)} title="Tracking and billing" subtitle={`${items.length} shipments: dates passed, not told, not billed`} size="large" footer={null}>
        <div className="space-y-3">
          <PillTabs tabs={AREAS} active={area} onChange={setArea} />
          {capped && <p className={`${HINT} m-0`}>Looks at the newest 1,000 active shipments.</p>}
          <div className="overflow-x-auto">
            <Table<TrackingAttentionItem> size="small" rowKey="id" dataSource={shown} columns={DIALOG_COLUMNS} pagination={{ pageSize: 25, hideOnSinglePage: true }} rowClassName={ROW_CLASS} onRow={rowProps} />
          </div>
        </div>
      </AppModal>
    </>
  );
}
