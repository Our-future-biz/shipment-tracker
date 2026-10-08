"use client";

import type { ReactNode } from "react";

export type KpiTone = "red" | "green" | "amber";

const TONE_CLASS: Record<KpiTone, string> = {
  red: "text-red-600",
  green: "text-green-600",
  amber: "text-amber-600",
};

const TILE_CLASS = "bg-white border border-slate-200 rounded-xl px-3 py-2.5 min-w-0";

interface CustomerKpiTileProps {
  label: string;
  value: ReactNode;
  tone?: KpiTone;
  // Small print under the value, e.g. a count behind an amount.
  hint?: ReactNode;
  hintTone?: KpiTone;
  // Makes the tile a button, e.g. to open the tab the figure comes from.
  onClick?: () => void;
}

// The one KPI tile of the customer section. Lay tiles out with KPI_GRID_CLASS so every row wraps the same way.
export function CustomerKpiTile({ label, value, tone, hint, hintTone, onClick }: CustomerKpiTileProps) {
  const content = (
    <>
      <div className="text-[11px] text-slate-400 uppercase tracking-wide truncate">{label}</div>
      <div className={`text-lg font-bold mt-0.5 truncate ${tone ? TONE_CLASS[tone] : "text-slate-800"}`}>{value}</div>
      {hint && <div className={`text-[11px] truncate ${hintTone ? TONE_CLASS[hintTone] : "text-slate-400"}`}>{hint}</div>}
    </>
  );

  if (!onClick) return <div className={TILE_CLASS}>{content}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${TILE_CLASS} block w-full text-left cursor-pointer transition-colors hover:border-indigo-300 hover:bg-indigo-50/40`}
    >
      {content}
    </button>
  );
}

export const KPI_GRID_CLASS = "grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3";

// Profit-like figures: green when positive, red when negative, neutral at zero.
export function profitTone(value: number): KpiTone | undefined {
  if (value > 0) return "green";
  if (value < 0) return "red";
  return undefined;
}
