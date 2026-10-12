"use client";

import { useState } from "react";
import { Modal, Table, Tag } from "antd";
import { CalendarFilled } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { formatDate } from "@/lib/date";
import { type Occurrence, overlaps, thisWeek, todayIso } from "../_lib/holidays";

// A card lists only the first few; the count shows the total and the link opens them all.
const VISIBLE_ROWS = 3;

type CardKey = "today" | "week";

const CARDS: Record<CardKey, { title: string; empty: string; linkLabel: string; tone: { border: string; header: string; icon: string; link: string } }> = {
  today: {
    title: "Today's Holidays",
    empty: "No public holiday today.",
    linkLabel: "Click here to show all of today's holidays",
    tone: { border: "border-red-200", header: "bg-red-50", icon: "text-red-500", link: "text-red-600" },
  },
  week: {
    title: "This Week's Holidays",
    empty: "No public holiday this week.",
    linkLabel: "Click here to show all of this week's holidays",
    tone: { border: "border-amber-200", header: "bg-amber-50", icon: "text-amber-500", link: "text-orange-500" },
  },
};

const dash = <span className="text-slate-300">—</span>;

const dateLabel = (o: Occurrence) => (o.start === o.end ? formatDate(o.start) : `${formatDate(o.start)} – ${formatDate(o.end)}`);

const countryColumn = {
  title: "Country",
  dataIndex: "country",
  width: 190,
  render: (_: unknown, o: Occurrence) => (
    <span className="font-semibold text-slate-800">
      {o.country || o.countryCode}
      {o.country && o.countryCode && <span className="ml-1.5 text-[11px] font-mono text-slate-400">{o.countryCode}</span>}
    </span>
  ),
};

const holidayColumn = {
  title: "Holiday",
  dataIndex: "name",
  render: (_: unknown, o: Occurrence) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-slate-800">{o.name}</span>
      <Tag color={o.kind === "National" ? "red" : "orange"} className="m-0">
        {o.kind === "National" ? "National" : `Regional${o.regions ? `: ${o.regions}` : ""}`}
      </Tag>
    </div>
  ),
};

const dateColumn = {
  title: "Date",
  dataIndex: "start",
  width: 200,
  render: (_: unknown, o: Occurrence) => <span className="text-slate-600 tabular-nums">{dateLabel(o)}</span>,
};

const COLUMNS: ColumnsType<Occurrence> = [countryColumn, holidayColumn, dateColumn];
const DIALOG_COLUMNS: ColumnsType<Occurrence> = [
  countryColumn,
  holidayColumn,
  dateColumn,
  { title: "Region(s)", dataIndex: "regions", render: (v: string) => v || dash },
];

// Public holidays today and this week across all countries, above the list so they
// cannot be missed — the same two-card look as Needs Attention on Shipments.
export function HolidayAlerts({ items, loading }: { items: Occurrence[]; loading: boolean }) {
  const [openCard, setOpenCard] = useState<CardKey | null>(null);
  const today = todayIso();
  const week = thisWeek();
  const lists: Record<CardKey, Occurrence[]> = {
    today: items.filter((o) => overlaps(o, today, today)),
    week: items.filter((o) => overlaps(o, week.from, week.to)),
  };

  const renderCard = (key: CardKey) => {
    const { title, empty, linkLabel, tone } = CARDS[key];
    const list = lists[key];
    const any = list.length > 0;
    return (
      <section className={`bg-white border rounded-2xl overflow-hidden ${any ? tone.border : "border-slate-200"}`}>
        <div className={`flex items-center gap-2 px-4 py-2.5 ${any ? tone.header : "bg-slate-50"}`}>
          <CalendarFilled className={any ? tone.icon : "text-slate-300"} />
          <span className="text-[13px] font-bold uppercase tracking-wider text-slate-800">{title}</span>
          <span
            className={`min-w-6 h-6 px-1.5 rounded-full flex items-center justify-center bg-white text-[13px] font-bold tabular-nums ${
              any ? tone.link : "text-slate-500"
            }`}
          >
            {list.length}
          </span>
          <span className="text-[13px] text-slate-600">
            {key === "today" ? formatDate(today) : `${formatDate(week.from)} – ${formatDate(week.to)}`}
          </span>
        </div>
        <Table<Occurrence>
          size="small"
          rowKey="key"
          showHeader={false}
          loading={loading}
          locale={{ emptyText: <span className="text-[13px] text-slate-400">{empty}</span> }}
          footer={
            list.length > VISIBLE_ROWS
              ? () => (
                  <button
                    type="button"
                    onClick={() => setOpenCard(key)}
                    className={`p-0 border-none bg-transparent text-[13px] font-semibold cursor-pointer hover:underline ${tone.link}`}
                  >
                    {linkLabel}
                  </button>
                )
              : undefined
          }
          dataSource={list.slice(0, VISIBLE_ROWS)}
          columns={COLUMNS}
          pagination={false}
        />
      </section>
    );
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderCard("today")}
        {renderCard("week")}
      </div>
      <Modal
        open={!!openCard}
        onCancel={() => setOpenCard(null)}
        title={openCard ? CARDS[openCard].title : ""}
        footer={null}
        width={1000}
      >
        <Table<Occurrence>
          size="small"
          rowKey="key"
          dataSource={openCard ? lists[openCard] : []}
          columns={DIALOG_COLUMNS}
          pagination={false}
          scroll={{ x: 800, y: 520 }}
        />
      </Modal>
    </>
  );
}
