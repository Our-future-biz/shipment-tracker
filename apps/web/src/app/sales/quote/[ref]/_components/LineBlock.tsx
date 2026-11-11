import type { ReactNode } from "react";
import { CARD, CARD_BAR, CARD_TITLE, TD, TH } from "@/styles/ui";

interface LineBlockProps {
  title: string;
  // A quiet line beside the title (the cargo weight of a block's containers). It gives way first
  // when the header runs out of room.
  note?: ReactNode;
  // The note as plain text, shown on hover when the note is cut off.
  noteText?: string;
  actions?: ReactNode;
  children: ReactNode;
}

// A block of the quote's Cargo details or Pricing step - the cargo description, packages, cost
// lines, exchange rates: a card of its own, as the cards of a shipment's Cargo Details, whose
// header bar (CARD_BAR) names the block and holds its actions.
export function LineBlock({ title, note, noteText, actions, children }: LineBlockProps) {
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className={`${CARD_BAR} justify-between`}>
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h3 className={`${CARD_TITLE} min-w-0 truncate`}>{title}</h3>
          {/* The note gives way first in a narrow card; its whole text stays on hover. */}
          {note && (
            <span className="min-w-0 shrink-[9999] truncate text-[12px] text-slate-500" title={noteText}>
              {note}
            </span>
          )}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

interface LineTableProps {
  minWidthClass: string;
  // Edge to edge: a table that is not a block's own (in a window, in a box with its own frame).
  flush?: boolean;
  children: ReactNode;
}

// The table of such a block, in the app's plain-table look (TH / TD). Its cells hold 24px inputs.
// It stands in from the block's frame: its first column starts under the block's title and its
// row lines stop short of the frame. Wider than a narrow card allows, it scrolls inside the block.
export function LineTable({ minWidthClass, flush = false, children }: LineTableProps) {
  const table = (
    <div className="overflow-x-auto">
      <table className={`w-full table-fixed border-collapse text-[13px] [&_tbody>tr:last-child>td]:border-b-0 ${minWidthClass}`}>{children}</table>
    </div>
  );
  return flush ? table : <div className="px-2 pb-1">{table}</div>;
}

// The app's table head and body cells (styles/ui.ts). A cell's own colour beside TD's slate-700
// needs "!" (e.g. "!text-red-600"): Tailwind orders one property's classes by name, not by place.
export const LINE_TH_CLASS = TH;
// The heading of a column of figures.
export const LINE_TH_RIGHT_CLASS = `${TH} !text-right`;
// The heading of a narrow checkbox column: over the checkbox, on two lines when it doesn't fit on one.
export const LINE_TH_CHECK_CLASS = `${TH} !text-center !whitespace-normal`;
export const LINE_TD_CLASS = TD;

interface LineBlockEmptyProps {
  children: ReactNode;
}

// What a block says while it has no line.
export function LineBlockEmpty({ children }: LineBlockEmptyProps) {
  return <div className="px-4 py-3 text-xs text-slate-400">{children}</div>;
}
