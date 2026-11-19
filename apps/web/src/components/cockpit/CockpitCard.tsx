"use client";

import { Modal } from "antd";
import { Table } from "@/components/Table";
import { WarningFilled } from "@ant-design/icons";
import type { ColumnsType, TableProps } from "antd/es/table";
import { CARD, CARD_BAR, CARD_TITLE, HINT, MODAL_TITLE } from "@/styles/ui";

// The URGENT / ATTENTION card of a managers' cockpit and the dialog that lists all of a card's
// rows. One anatomy for Sales → Managers, Warehouse Concept → Managers and Shipments → Managers
// (the same as the Shipments page's Needs Attention cards): a bar with the title, the count and
// the window ("act today"), the first few rows, and a link that opens them all.
// The page brings its own row type: its columns, its wording (cockpitCards), where a row leads.
// A page that looked different before the parts were shared keeps its look through `tone` / `look`.

export type CockpitCardKey = "urgent" | "attention";

/** One card of the server's answer: `total` counts everything, `rows` may be cut at the server's limit. */
export interface CockpitList<R> {
  total: number;
  rows: R[];
}

/** A card's warning colour, worn only while the card holds something. */
export interface CockpitTone {
  /** The frame (and, in the default look, the line under the bar). */
  border: string;
  /** The bar's background. */
  header: string;
  icon: string;
  /** The count (and, in the default look, the "Click here to show …" link). */
  text: string;
}

export interface CockpitCardDef {
  title: string;
  /** How soon: "act today", "within 48 hours". */
  window: string;
  linkLabel: string;
  /** What the card says when it holds nothing. */
  empty: string;
  /** The dialog's title. */
  dialog: string;
  tone: CockpitTone;
}

// border has "!": on the card it replaces CARD's own slate frame.
const COCKPIT_TONES: Record<CockpitCardKey, CockpitTone> = {
  urgent: { border: "!border-red-200", header: "bg-red-50", icon: "text-red-500", text: "text-red-600" },
  attention: { border: "!border-amber-200", header: "bg-amber-50", icon: "text-amber-500", text: "text-amber-600" },
};

/** How soon each card is, for a page whose windows are not the twins' "act today" and "within 48 hours". */
export interface CockpitWindows {
  /** The URGENT card's window: "today or the next working day". */
  urgent: string;
  /** The ATTENTION card's window: "the two working days after". */
  attention: string;
  /** What the ATTENTION card says when it is empty. */
  nothingToWatch: string;
}

const COCKPIT_WINDOWS: CockpitWindows = { urgent: "act today", attention: "within 48 hours", nothingToWatch: "Nothing to watch within 48 hours." };

/**
 * The two cards in a page's own words: `things` is what the rows are ("quotes", "positions"),
 * `nothingUrgent` what the URGENT card says when it is empty. `windows` only for a page that
 * counts its windows another way (Shipments → Managers: working days); whatever it leaves out
 * reads as on the other pages.
 */
export const cockpitCards = (
  things: string,
  nothingUrgent: string,
  tones: Record<CockpitCardKey, CockpitTone> = COCKPIT_TONES,
  windows: Partial<CockpitWindows> = {},
): Record<CockpitCardKey, CockpitCardDef> => {
  const { urgent, attention, nothingToWatch } = { ...COCKPIT_WINDOWS, ...windows };
  return {
    urgent: {
      title: "Urgent",
      window: urgent,
      linkLabel: `Click here to show URGENT ${things}`,
      empty: nothingUrgent,
      dialog: `URGENT ${things}`,
      tone: tones.urgent,
    },
    attention: {
      title: "Attention",
      window: attention,
      linkLabel: `Click here to show ATTENTION ${things}`,
      empty: nothingToWatch,
      dialog: `ATTENTION ${things}`,
      tone: tones.attention,
    },
  };
};

/** The classes the pages draw differently. `tone` is the card's colour while it holds something, null while it is empty. */
export interface CockpitCardLook {
  frame: (tone: CockpitTone | null) => string;
  bar: (tone: CockpitTone | null) => string;
  /** The window text beside the count. */
  window: string;
  /** The "Could not load …" text. */
  error: string;
  /** The "Click here to show …" link under the rows. */
  showAll: (tone: CockpitTone) => string;
}

/** The look of Sales → Managers, built on the app's card (CARD, CARD_BAR): what a new page takes. */
const COCKPIT_CARD_LOOK: CockpitCardLook = {
  frame: (tone) => `${CARD} overflow-clip ${tone ? tone.border : ""}`,
  // The card's bar (CARD_BAR), in the card's own warning colour while it holds something.
  bar: (tone) => (tone ? `flex items-center gap-2.5 min-h-[42px] px-4 py-2 border-b ${tone.border} ${tone.header}` : CARD_BAR),
  window: "text-[13px] text-slate-500",
  error: "text-[13px] text-red-500",
  showAll: (tone) => `p-0 border-none bg-transparent text-[13px] font-semibold cursor-pointer hover:underline ${tone.text}`,
};

/** A card lists only its first few; the count shows the total and the link opens them all. */
const VISIBLE_ROWS = 3;

export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

interface RowsProps<R> {
  columns: ColumnsType<R>;
  rowKey: (row: R) => string;
  /** What a click on a row does (the page opens the record); leave out where a row leads nowhere. */
  onRow?: TableProps<R>["onRow"];
  rowClassName?: string;
}

interface CockpitCardProps<R> extends RowsProps<R> {
  card: CockpitCardDef;
  /** Undefined until the answer is there. */
  list: CockpitList<R> | undefined;
  isLoading: boolean;
  /** The load failed: the count reads "–" and the list says `loadFailed`, never "0" and the empty text. */
  isError: boolean;
  /** "Could not load Sales." */
  loadFailed: string;
  /** Opens the dialog with all of the card's rows (CockpitDialog). */
  onShowAll: () => void;
  look?: CockpitCardLook;
}

export function CockpitCard<R extends object>({
  card,
  list,
  isLoading,
  isError,
  loadFailed,
  onShowAll,
  columns,
  rowKey,
  onRow,
  rowClassName,
  look = COCKPIT_CARD_LOOK,
}: CockpitCardProps<R>) {
  const { title, window, linkLabel, empty, tone } = card;
  const total = list?.total ?? 0;
  const hot = total > 0;
  const worn = hot ? tone : null;
  return (
    <section aria-label={`${title} — ${window}`} className={look.frame(worn)}>
      <div className={look.bar(worn)}>
        <WarningFilled className={hot ? tone.icon : "text-slate-300"} />
        <span className={CARD_TITLE}>{title}</span>
        <span
          aria-label={isError ? "Count unavailable" : plural(total, "item")}
          className={`min-w-6 h-6 px-1.5 rounded-full flex items-center justify-center bg-white text-[13px] font-bold tabular-nums ${hot ? tone.text : "text-slate-500"}`}
        >
          {isError ? "–" : isLoading ? "…" : total}
        </span>
        <span className={look.window}>{window}</span>
      </div>
      {/* No header row: the card's own header already says what the list is. */}
      <Table<R>
        size="small"
        rowKey={rowKey}
        showHeader={false}
        loading={isLoading}
        locale={{
          emptyText: isError ? <span className={look.error}>{loadFailed}</span> : <span className="text-[13px] text-slate-400">{empty}</span>,
        }}
        footer={
          hot
            ? () => (
                <button type="button" onClick={onShowAll} className={look.showAll(tone)}>
                  {linkLabel}
                </button>
              )
            : undefined
        }
        dataSource={(list?.rows ?? []).slice(0, VISIBLE_ROWS)}
        columns={columns}
        tableLayout="fixed"
        pagination={false}
        rowClassName={rowClassName}
        onRow={onRow}
      />
    </section>
  );
}

interface CockpitDialogProps<R> extends RowsProps<R> {
  /** The card whose rows are listed; null keeps the dialog closed. */
  card: CockpitCardDef | null;
  list: CockpitList<R> | undefined;
  onClose: () => void;
}

/** Every row of one card, with the page's wider columns. Says so when the server listed only the first of them. */
export function CockpitDialog<R extends object>({ card, list, onClose, columns, rowKey, onRow, rowClassName }: CockpitDialogProps<R>) {
  return (
    // Wide enough for the columns; the table scrolls sideways rather than spill out on a narrow window.
    <Modal
      open={!!card}
      onCancel={onClose}
      title={
        card && (
          <div>
            <div className={MODAL_TITLE}>{card.dialog}</div>
            <div className={`${HINT} font-normal mt-0.5`}>
              {plural(list?.total ?? 0, "item")} — {card.window}
              {list && list.total > list.rows.length ? ` · the first ${list.rows.length} are listed` : ""}
            </div>
          </div>
        )
      }
      width="min(1200px, calc(100vw - 48px))"
      footer={null}
      destroyOnHidden
    >
      <Table<R>
        size="small"
        rowKey={rowKey}
        scroll={{ x: "max-content" }}
        dataSource={list?.rows ?? []}
        columns={columns}
        pagination={{ pageSize: 15, hideOnSinglePage: true, size: "small" }}
        rowClassName={rowClassName}
        onRow={onRow}
      />
    </Modal>
  );
}
