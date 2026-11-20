"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Tag } from "antd";
import { Table } from "@/components/Table";
import { WarningFilled } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { StatusBadge } from "@/components/StatusBadge";
import { deadlineColor, deadlineText } from "@/lib/shipmentDeadlines";
import { useShipmentsNeedingAttention } from "@/hooks/useShipmentsNeedingAttention";
import type { ShipmentDueItem } from "@/hooks/useShipmentsNeedingAttention";
import { CARD_TITLE, EMPTY, HINT, MODAL_TITLE, REF } from "@/styles/ui";
import { TrackingAttentionCard } from "./TrackingAttentionCard";

// A card lists only its soonest few; the count shows the total and the link opens them all.
const VISIBLE_ROWS = 3;

type CardKey = "within24h" | "within48h";

interface CardDef {
  /** What the card counts: deadlines only, so it isn't read as Shipments → Managers' URGENT, which counts every signal (user council M3 / M14). */
  title: string;
  /** The dialog's title. */
  dialog: string;
  /** When it is due, said after the count: the windows are working days, as on Shipments → Managers. */
  window: string;
  /** The same inside a sentence: "Nothing due …", "3 to finish …". */
  due: string;
  linkLabel: string;
  tone: { border: string; header: string; icon: string; link: string };
}

const CARDS: Record<CardKey, CardDef> = {
  within24h: {
    title: "Urgent deadlines",
    dialog: "Urgent deadlines",
    window: "today or the next working day",
    due: "today or the next working day",
    linkLabel: "Click here to show the urgent deadlines",
    tone: { border: "border-red-200", header: "bg-red-50", icon: "text-red-500", link: "text-red-600" },
  },
  within48h: {
    title: "Deadlines coming",
    dialog: "Deadlines coming",
    window: "the two working days after",
    due: "in the two working days after",
    linkLabel: "Click here to show the deadlines coming",
    tone: { border: "border-amber-200", header: "bg-amber-50", icon: "text-amber-500", link: "text-amber-600" },
  },
};

const dash = <span className={EMPTY}>—</span>;

const referenceColumn = {
  title: "Internal Reference",
  dataIndex: "jobNumber",
  width: 170,
  render: (v: string) => <span className={`${REF} font-semibold text-indigo-600`}>{v}</span>,
};

// A date is as urgent as its card: everything on the URGENT one is red - a missed Closing
// ("Closing missed · 17.11. 14:00") and an overdue filing among it.
const deadlinesColumn = (card: CardKey) => ({
  title: "Due",
  dataIndex: "deadlines",
  render: (_: unknown, r: ShipmentDueItem) => (
    <div className="flex flex-wrap gap-1.5">
      {r.deadlines.map((d) => (
        <Tag key={d.field} color={deadlineColor(card)} className="m-0">
          {deadlineText(d)}
        </Tag>
      ))}
    </div>
  ),
});

const cardColumns = (card: CardKey): ColumnsType<ShipmentDueItem> => [referenceColumn, deadlinesColumn(card)];
const CARD_COLUMNS: Record<CardKey, ColumnsType<ShipmentDueItem>> = { within24h: cardColumns("within24h"), within48h: cardColumns("within48h") };

const dialogColumns = (card: CardKey): ColumnsType<ShipmentDueItem> => [
  referenceColumn,
  { title: "Customer", dataIndex: "customer", render: (v: string) => v || dash },
  { title: "Direction", dataIndex: "tradeDirection", width: 100, render: (v: string) => v || dash },
  { title: "Status", dataIndex: "status", render: (v: string) => (v ? <StatusBadge status={v} /> : dash) },
  deadlinesColumn(card),
];
const DIALOG_COLUMNS: Record<CardKey, ColumnsType<ShipmentDueItem>> = { within24h: dialogColumns("within24h"), within48h: dialogColumns("within48h") };

// Shipments with a deadline coming up, shown above the grid so they cannot be missed: one card
// for what is due today or the next working day (and every cut-off missed or overdue), one for
// the two working days after - the windows and the deadline rules of Shipments → Managers. They
// count deadlines only, and say so: the cockpit's URGENT and ATTENTION count every signal (a late
// departure, nobody in Handled By, …), so its numbers are larger (user council M3 / M14). Each card
// previews its soonest shipments; its link opens the full list in a dialog.
export function NeedsAttentionTable() {
  const router = useRouter();
  const lists = useShipmentsNeedingAttention();
  const [openCard, setOpenCard] = useState<CardKey | null>(null);

  const rowProps = (r: ShipmentDueItem) => ({ onClick: () => router.push(`/shipments/${r.id}`) });

  const renderCard = (key: CardKey) => {
    const { title, window, due, linkLabel, tone } = CARDS[key];
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
      // A card (CARD's corners and shadow) in the colour of its warning while it lists anything.
      <section className={`bg-white border rounded-xl shadow-sm overflow-clip ${urgent ? tone.border : "border-slate-200"}`}>
        <div className={`flex items-center gap-2.5 min-h-[42px] px-4 py-2 ${urgent ? tone.header : "bg-slate-50"}`}>
          <WarningFilled className={urgent ? tone.icon : "text-slate-300"} />
          <h3 className={CARD_TITLE}>{title}</h3>
          <span
            aria-label={lists.isError ? "Count unavailable" : `${shipments.length} shipments`}
            className={`min-w-6 h-6 px-1.5 rounded-full flex items-center justify-center bg-white text-[13px] font-bold tabular-nums ${
              urgent ? tone.link : "text-slate-500"
            }`}
          >
            {lists.isError ? "–" : shipments.length}
          </span>
          <span className="text-[13px] text-slate-500">{window}</span>
        </div>
        {/* No header row: the card's own header already says what the list is. */}
        <Table<ShipmentDueItem>
          size="small"
          rowKey="id"
          showHeader={false}
          loading={lists.isLoading}
          locale={{
            emptyText: lists.isError ? (
              <span className="text-[13px] text-red-600">Could not load the deadlines.</span>
            ) : (
              <span className="text-[13px] text-slate-500">Nothing due {due}.</span>
            ),
          }}
          footer={urgent ? () => showAllLink : undefined}
          dataSource={shipments.slice(0, VISIBLE_ROWS)}
          columns={CARD_COLUMNS[key]}
          pagination={false}
          rowClassName="cursor-pointer"
          onRow={rowProps}
        />
      </section>
    );
  };

  const openList = openCard ? lists[openCard] : [];

  // Said only when it is so: what the lists could not take into account.
  const notes = [
    lists.capped ? "More jobs have dates around today than could be read: the lists may miss some." : "",
    lists.holidaysKnown ? "" : "The company's holidays could not be read: working days skip weekends and public holidays only.",
    lists.notKnown.length ? `Not known right now: ${lists.notKnown.join(", ")}.` : "",
  ].filter(Boolean);

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderCard("within24h")}
        {renderCard("within48h")}
        {notes.length > 0 && <p className={`${HINT} lg:col-span-2 m-0`}>{notes.join(" ")}</p>}
        <div className="lg:col-span-2 min-w-0">
          <TrackingAttentionCard />
        </div>
      </div>

      {/* Wide enough for the five columns; the table scrolls sideways rather than spill out on a narrow window. */}
      <Modal
        open={!!openCard}
        onCancel={() => setOpenCard(null)}
        title={
          <div>
            <div className={MODAL_TITLE}>{openCard ? CARDS[openCard].dialog : ""}</div>
            {openCard && (
              <div className={`${HINT} font-normal mt-0.5`}>
                {openList.length} to finish {CARDS[openCard].due}
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
          locale={{ emptyText: openCard ? `Nothing due ${CARDS[openCard].due}.` : "" }}
          dataSource={openList}
          columns={openCard ? DIALOG_COLUMNS[openCard] : []}
          pagination={{ pageSize: 15, hideOnSinglePage: true, size: "small" }}
          rowClassName="cursor-pointer"
          onRow={rowProps}
        />
      </Modal>
    </>
  );
}
