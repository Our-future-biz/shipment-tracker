import type { ReactNode } from "react";

interface LineBlockProps {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}

// A block of lines inside a section card - packages, cost lines, exchange rates: a nested box
// whose header strip names the block and holds its actions.
export function LineBlock({ title, actions, children }: LineBlockProps) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
        <h3 className="m-0 min-w-0 truncate text-[11px] font-bold text-slate-600 uppercase tracking-wider">{title}</h3>
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

// The table of such a block, in the compact line-table look of the Customs cards. Its cells hold
// 24px inputs. Wider than a narrow card allows, it scrolls inside the block.
export function LineTable({ minWidthClass, children }: LineTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full table-fixed border-collapse text-xs [&_tbody>tr:last-child>td]:border-b-0 ${minWidthClass}`}>{children}</table>
    </div>
  );
}

const LINE_TH_SHAPE = "px-2 py-1.5 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap";
export const LINE_TH_CLASS = `${LINE_TH_SHAPE} text-left`;
// The heading of a column of figures.
export const LINE_TH_RIGHT_CLASS = `${LINE_TH_SHAPE} text-right`;
export const LINE_TD_CLASS = "px-2 py-1.5 border-b border-slate-100 align-middle";

interface LineBlockEmptyProps {
  children: ReactNode;
}

// What a block says while it has no line.
export function LineBlockEmpty({ children }: LineBlockEmptyProps) {
  return <div className="px-3 py-3 text-xs text-slate-400">{children}</div>;
}
