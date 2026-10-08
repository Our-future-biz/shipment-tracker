"use client";

import type { ReactNode } from "react";

interface CustomerInfoRowProps {
  label: string;
  // Text, a badge, or an inline editor. Empty text renders as a grey dash.
  children?: ReactNode;
  // Narrow cards (the 300px side column) need a narrower label.
  narrow?: boolean;
}

// Label/value row in the same shape as the shipment detail cards.
export function CustomerInfoRow({ label, children, narrow = false }: CustomerInfoRowProps) {
  const empty = children === undefined || children === null || children === "";
  return (
    <div className="flex items-center gap-2.5 py-1.5 text-xs border-b border-slate-100 last:border-b-0 min-h-[34px]">
      <span className={`${narrow ? "w-[96px]" : "w-[160px]"} shrink-0 text-[11px] font-bold text-slate-500 uppercase tracking-wide`}>
        {label}
      </span>
      <span className={`flex-1 min-w-0 font-medium [overflow-wrap:anywhere] ${empty ? "text-slate-300" : "text-slate-900"}`}>
        {empty ? "—" : children}
      </span>
    </div>
  );
}
