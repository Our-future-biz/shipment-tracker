import type { ReactNode } from "react";
import { CARD, CARD_BAR, CARD_TITLE, TD, TH } from "@/styles/ui";

interface LineBlockProps {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}

// A block of lines inside a section card - packages, cost lines, exchange rates: a nested card
// whose header bar (CARD_BAR) names the block and holds its actions.
export function LineBlock({ title, actions, children }: LineBlockProps) {
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className={`${CARD_BAR} justify-between`}>
        <h3 className={`${CARD_TITLE} min-w-0 truncate`}>{title}</h3>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

interface LineTableProps {
  minWidthClass: string;
  children: ReactNode;
}

// The table of such a block, in the app's plain-table look (TH / TD). Its cells hold 24px inputs.
// Wider than a narrow card allows, it scrolls inside the block.
export function LineTable({ minWidthClass, children }: LineTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full table-fixed border-collapse text-[13px] [&_tbody>tr:last-child>td]:border-b-0 ${minWidthClass}`}>{children}</table>
    </div>
  );
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
  return <div className="px-3 py-3 text-xs text-slate-400">{children}</div>;
}
