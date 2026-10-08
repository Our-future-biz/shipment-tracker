"use client";

import { useRouter } from "next/navigation";
import { Table, Tag } from "antd";
import { WarningFilled } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { COLUMN_MAP } from "@/lib/columnConfig";
import { formatDate } from "@/lib/date";
import { useShipmentsNeedingAttention } from "@/hooks/useShipmentsNeedingAttention";
import type { ShipmentDueItem } from "@/hooks/useShipmentsNeedingAttention";

const DAY_LABELS = ["today", "tomorrow", "in 2 days"];
const DAY_COLORS = ["red", "orange", "gold"];

// Shipments with a deadline coming up, listed above the grid so they cannot be missed:
// one card for what is due within 24 hours, one for within 48 hours. Always shown, so
// empty tables read as "all clear".
type AttentionFilter = "attention" | "attention48";

interface NeedsAttentionTableProps {
  // The grid filter currently applied (?tile=), if any.
  activeFilter: string | null;
  // Narrows the grid below to a card's shipments; null clears it.
  onShowInGrid: (filter: AttentionFilter | null) => void;
}

interface CardDef {
  window: string;
  filter: AttentionFilter;
  linkLabel: string;
  tone: { border: string; header: string; icon: string; link: string };
}

const CARDS: Record<"within24h" | "within48h", CardDef> = {
  within24h: {
    window: "24 hours",
    filter: "attention",
    linkLabel: "Click here to show URGENT shipment",
    tone: { border: "border-red-200", header: "bg-red-50", icon: "text-red-500", link: "text-red-600" },
  },
  within48h: {
    window: "48 hours",
    filter: "attention48",
    linkLabel: "Click here to show Needs Attention shipment",
    tone: { border: "border-amber-200", header: "bg-amber-50", icon: "text-amber-500", link: "text-orange-500" },
  },
};

export function NeedsAttentionTable({ activeFilter, onShowInGrid }: NeedsAttentionTableProps) {
  const router = useRouter();
  const { within24h, within48h, isLoading } = useShipmentsNeedingAttention();

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

  // One card per window: its own "Needs Attention" header over its own table.
  const renderCard = ({ window, filter, linkLabel, tone }: CardDef, shipments: ShipmentDueItem[]) => {
    const urgent = shipments.length > 0;
    const filtering = activeFilter === filter;
    // Filters the grid below to this card's shipments; clicking again shows all of them.
    const gridLink = (
      <button
        type="button"
        aria-pressed={filtering}
        onClick={() => onShowInGrid(filtering ? null : filter)}
        className={`p-0 border-none bg-transparent text-[13px] font-semibold cursor-pointer hover:underline ${tone.link}`}
      >
        {filtering ? "Click here to show all shipments" : linkLabel}
      </button>
    );
    return (
      <section className={`bg-white border rounded-2xl overflow-hidden ${urgent ? tone.border : "border-slate-200"}`}>
        <div className={`flex items-center gap-2 px-4 py-2.5 ${urgent ? tone.header : "bg-slate-50"}`}>
          <WarningFilled className={urgent ? tone.icon : "text-slate-300"} />
          <span className="text-[13px] font-bold uppercase tracking-wider text-slate-800">Needs Attention</span>
          <span className="text-[13px] text-slate-600">
            {shipments.length} within {window}
          </span>
        </div>
        <Table<ShipmentDueItem>
          size="small"
          rowKey="id"
          loading={isLoading}
          locale={{ emptyText: gridLink }}
          footer={urgent ? () => gridLink : undefined}
          dataSource={shipments}
          columns={columnsFor(`Due within ${window}`)}
          pagination={{ pageSize: 10, hideOnSinglePage: true, size: "small" }}
          rowClassName="cursor-pointer"
          onRow={(r) => ({ onClick: () => router.push(`/shipments/${r.id}`) })}
        />
      </section>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {renderCard(CARDS.within24h, within24h)}
      {renderCard(CARDS.within48h, within48h)}
    </div>
  );
}
