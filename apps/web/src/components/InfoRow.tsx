"use client";

import type { ReactNode } from "react";
import { EMPTY, LABEL_TEXT } from "@/styles/ui";

interface InfoRowProps {
  label: string;
  // Text, a badge, or an inline editor. Empty text renders as a grey dash.
  children?: ReactNode;
  // Narrow cards (the 300px side column) need a narrower label.
  narrow?: boolean;
}

// Label/value row in the same shape as the shipment detail cards.
export function InfoRow({ label, children, narrow = false }: InfoRowProps) {
  const empty = children === undefined || children === null || children === "";
  return (
    <div className="flex items-center gap-2.5 py-1.5 text-[13px] border-b border-slate-100 last:border-b-0 min-h-[34px]">
      <span className={`${narrow ? "w-[96px]" : "w-[160px]"} shrink-0 ${LABEL_TEXT}`}>
        {label}
      </span>
      <span className={`flex-1 min-w-0 [overflow-wrap:anywhere] ${empty ? EMPTY : "text-slate-900"}`}>
        {empty ? "—" : children}
      </span>
    </div>
  );
}
