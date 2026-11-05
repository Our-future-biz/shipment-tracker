import type { ComponentProps } from "react";

// The shape of every status pill in the app - quote status, account type, a mark on a row. The
// colours come from whoever draws the pill.
export const PILL_CLASS = "inline-flex items-center gap-1 whitespace-nowrap rounded-xl text-[11px] font-medium px-2.5 py-0.5 leading-[18px]";

export type PillTone = "red" | "amber" | "green" | "indigo" | "slate";

const TONE_CLASS: Record<PillTone, string> = {
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-700",
  green: "bg-emerald-100 text-emerald-700",
  indigo: "bg-indigo-100 text-indigo-700",
  slate: "bg-slate-100 text-slate-700",
};

interface PillProps {
  tone: PillTone;
}

// A short mark in one of the app's tones: "Overdue", "Incomplete". Everything a span takes goes to
// the span, so the pill can carry a title or sit inside a Tooltip.
export function Pill({ tone, className = "", ...span }: PillProps & ComponentProps<"span">) {
  return <span {...span} className={`${PILL_CLASS} ${TONE_CLASS[tone]} ${className}`} />;
}
