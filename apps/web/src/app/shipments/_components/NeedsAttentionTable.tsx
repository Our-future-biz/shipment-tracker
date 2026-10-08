"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Table, Tag } from "antd";
import { WarningFilled } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { StatusBadge } from "@/components/StatusBadge";
import { COLUMN_MAP } from "@/lib/columnConfig";
import { formatDate } from "@/lib/date";
import { useShipmentsNeedingAttention } from "@/hooks/useShipmentsNeedingAttention";
import type { ShipmentDueItem } from "@/hooks/useShipmentsNeedingAttention";

// A card lists only its soonest few; the count shows the total and the link opens them all.
const VISIBLE_ROWS = 3;

// AMS and ISF are not dates on the shipment: they are due 4 days before departure.
const COMPUTED_DEADLINE_LABELS: Record<string, string> = {
  amsDeadline: "AMS (4 days before ETD)",
  isfDeadline: "ISF (4 days before ETD)",
};
const deadlineLabel = (field: string) => COMPUTED_DEADLINE_LABELS[field] ?? COLUMN_MAP.get(field)?.title ?? field;

const dayLabel = (daysLeft: number) => {
  if (daysLeft < 0) return `overdue ${-daysLeft} day${daysLeft === -1 ? "" : "s"}`;
  return ["today", "tomorrow"][daysLeft] ?? `in ${daysLeft} days`;
};
// Everything within 24 hours (overdue, today, tomorrow) is urgent red; the 48-hour window is orange.
const dayColor = (daysLeft: number) => (daysLeft <= 1 ? "red" : "orange");

type CardKey = "within24h" | "within48h";

interface CardDef {
  window: string;
  linkLabel: string;
  tone: { border: string; header: string; icon: string; link: string };
}

const CARDS: Record<CardKey, CardDef> = {
  within24h: {
    window: "24 hours",
    linkLabel: "Click here to show URGENT shipment",
    tone: { border: "border-red-200", header: "bg-red-50", icon: "text-red-500", link: "text-red-600" },
  },
  within48h: {
    window: "48 hours",
    linkLabel: "Click here to show Needs Attention shipment",
    tone: { border: "border-amber-200", header: "bg-amber-50", icon: "text-amber-500", link: "text-orange-500" },
  },
};

const dash = <span className="text-slate-300">—</span>;

const referenceColumn = {
  title: "Internal Reference",
  dataIndex: "jobNumber",
  width: 170,
  render: (v: string) => <span className="font-mono font-semibold text-indigo-600">{v}</span>,
};

const deadlinesColumn = {
  title: "Due",
  dataIndex: "deadlines",
  render: (_: unknown, r: ShipmentDueItem) => (
    <div className="flex flex-wrap gap-1.5">
      {r.deadlines.map((d) => (
        <Tag key={d.field} color={dayColor(d.daysLeft)} className="m-0">
          {deadlineLabel(d.field)}: {dayLabel(d.daysLeft)} ({formatDate(d.date)})
        </Tag>
      ))}
    </div>
  ),
};

const CARD_COLUMNS: ColumnsType<ShipmentDueItem> = [referenceColumn, deadlinesColumn];

const DIALOG_COLUMNS: ColumnsType<ShipmentDueItem> = [
  referenceColumn,
  { title: "Customer", dataIndex: "customer", render: (v: string) => v || dash },
  { title: "Direction", dataIndex: "tradeDirection", width: 100, render: (v: string) => v || dash },
  { title: "Status", dataIndex: "status", render: (v: string) => (v ? <StatusBadge status={v} /> : dash) },
  deadlinesColumn,
];

// Shipments with a deadline coming up, shown above the grid so they cannot be missed:
// one card for what is due within 24 hours, one for within 48 hours. Each card previews
// its soonest shipments; its link opens the full list in a dialog.
export function NeedsAttentionTable() {
  const router = useRouter();
  const lists = useShipmentsNeedingAttention();
  const [openCard, setOpenCard] = useState<CardKey | null>(null);

  const rowProps = (r: ShipmentDueItem) => ({ onClick: () => router.push(`/shipments/${r.id}`) });

  const renderCard = (key: CardKey) => {
    const { window, linkLabel, tone } = CARDS[key];
    const shipments = lists[key];
    const urgent = shipments.length > 0;
    const showAllLink = (
      <button
        type="button"
        onClick={() => setOpenCard(key)}
        className={`p-0 border-none bg-transparent text-[13px] font-semibold cursor-pointer hover:underline ${tone.link}`}
      >
        {linkLabel}
      </button>
    );

    return (
      <section className={`bg-white border rounded-2xl overflow-hidden ${urgent ? tone.border : "border-slate-200"}`}>
        <div className={`flex items-center gap-2 px-4 py-2.5 ${urgent ? tone.header : "bg-slate-50"}`}>
          <WarningFilled className={urgent ? tone.icon : "text-slate-300"} />
          <span className="text-[13px] font-bold uppercase tracking-wider text-slate-800">Needs Attention</span>
          <span
            aria-label={`${shipments.length} shipments`}
            className={`min-w-6 h-6 px-1.5 rounded-full flex items-center justify-center bg-white text-[13px] font-bold tabular-nums ${
              urgent ? tone.link : "text-slate-500"
            }`}
          >
            {shipments.length}
          </span>
          <span className="text-[13px] text-slate-600">within {window}</span>
        </div>
        {/* No header row: the card's own header already says what the list is. */}
        <Table<ShipmentDueItem>
          size="small"
          rowKey="id"
          showHeader={false}
          loading={lists.isLoading}
          locale={{ emptyText: showAllLink }}
          footer={urgent ? () => showAllLink : undefined}
          dataSource={shipments.slice(0, VISIBLE_ROWS)}
          columns={CARD_COLUMNS}
          pagination={false}
          rowClassName="cursor-pointer"
          onRow={rowProps}
        />
      </section>
    );
  };

  const openList = openCard ? lists[openCard] : [];

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderCard("within24h")}
        {renderCard("within48h")}
      </div>

      {/* Wide enough for the five columns; the table scrolls sideways rather than spill out on a narrow window. */}
      <Modal
        open={!!openCard}
        onCancel={() => setOpenCard(null)}
        title={
          <div>
            <div className="text-base font-semibold">{openCard === "within24h" ? "URGENT shipments" : "Needs Attention shipments"}</div>
            {openCard && (
              <div className="text-xs text-slate-500 font-normal mt-0.5">
                {openList.length} to finish within {CARDS[openCard].window}
              </div>
            )}
          </div>
        }
        width="min(1100px, calc(100vw - 48px))"
        footer={null}
        destroyOnHidden
      >
        <Table<ShipmentDueItem>
          size="small"
          rowKey="id"
          scroll={{ x: "max-content" }}
          locale={{ emptyText: openCard ? `Nothing due within ${CARDS[openCard].window}.` : "" }}
          dataSource={openList}
          columns={DIALOG_COLUMNS}
          pagination={{ pageSize: 15, hideOnSinglePage: true, size: "small" }}
          rowClassName="cursor-pointer"
          onRow={rowProps}
        />
      </Modal>
    </>
  );
}
