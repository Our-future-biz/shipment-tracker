import type { ReactNode } from "react";

// A locked value in the frame of an antd small input, so a row keeps its look when it isn't being
// edited (dates with times, postcode / country, opening hours). It takes no typing: the row opens
// on a double-click. An empty box shows its placeholder in grey.
export const LOCKED_BOX = "inline-flex items-center justify-between gap-2 h-6 px-2 rounded-md border border-slate-200 bg-white text-[13px] tabular-nums min-w-0";

export function LockedBox({ value, placeholder, icon, className = "", style }: { value?: ReactNode; placeholder?: string; icon?: ReactNode; className?: string; style?: React.CSSProperties }) {
  const empty = value === undefined || value === null || value === "";
  return (
    <span className={`${LOCKED_BOX} ${className}`}>
      <span className={`truncate ${empty ? "text-slate-400" : ""}`} style={empty ? undefined : style}>
        {empty ? placeholder : value}
      </span>
      {icon && <span className="shrink-0 text-slate-300 text-[12px] leading-none">{icon}</span>}
    </span>
  );
}
