import type { ReactNode } from "react";
import { LABEL_TEXT } from "@/styles/ui";

export type KpiTone = "red" | "green" | "amber";

// The colour of a tone, and the frame of a tile - also for a tile of its own beside these.
export const KPI_TONE_CLASS: Record<KpiTone, string> = {
  red: "text-red-600",
  green: "text-emerald-600",
  amber: "text-amber-600",
};

export const KPI_TILE_CLASS = "bg-white border border-slate-200 rounded-xl shadow-sm px-3 py-2.5 min-w-0";

interface KpiTileProps {
  label: ReactNode;
  /** A long label takes a second line where it doesn't fit, instead of being cut off. */
  wrapLabel?: boolean;
  value: ReactNode;
  tone?: KpiTone;
  // Small print under the value, e.g. a count behind an amount.
  hint?: ReactNode;
  hintTone?: KpiTone;
  // "text" is for a fact in words or a small control instead of a figure: the value is drawn at
  // 14px and is a row, so a dot or a button can stand beside the words.
  size?: "figure" | "text";
  // Makes the tile a button, e.g. to open the tab the figure comes from.
  onClick?: () => void;
  // A small control at the tile's right end that acts on what the tile says, e.g. "Followed up"
  // beside the last contact. Such a tile is not a button itself: a button cannot hold another.
  action?: ReactNode;
  // Everything centred across, and the value in the middle of the space under the label: for a
  // tile beside a taller one, so its figure does not sit in a corner.
  centered?: boolean;
}

// The app's one KPI tile. Lay tiles out with KPI_GRID_CLASS so every row wraps the same way.
export function KpiTile({ label, wrapLabel = false, value, tone, hint, hintTone, size = "figure", onClick, action, centered = false }: KpiTileProps) {
  const valueClass =
    (size === "figure" ? "text-[20px] leading-7 font-bold tabular-nums truncate" : "flex items-center gap-1.5 min-h-6 text-[14px] font-semibold") +
    (centered ? " flex-1 flex items-center justify-center text-center" : "");
  const content = (
    <>
      <div className={`${LABEL_TEXT}${wrapLabel ? "" : " truncate"}${centered ? " text-center" : ""}`}>{label}</div>
      <div className={`mt-0.5 ${valueClass} ${tone ? KPI_TONE_CLASS[tone] : "text-slate-900"}`}>{value}</div>
      {hint && <div className={`text-[12px] truncate${centered ? " text-center" : ""} ${hintTone ? KPI_TONE_CLASS[hintTone] : "text-slate-500"}`}>{hint}</div>}
    </>
  );

  if (action) {
    // The content keeps to the top, so its label stays in line with the labels of the tiles beside it.
    return (
      <div className={`${KPI_TILE_CLASS} flex gap-3`}>
        <div className="flex-1 min-w-0">{content}</div>
        <div className="shrink-0 self-center">{action}</div>
      </div>
    );
  }

  if (!onClick) return <div className={centered ? `${KPI_TILE_CLASS} flex flex-col` : KPI_TILE_CLASS}>{content}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${KPI_TILE_CLASS} block w-full text-left cursor-pointer transition-colors hover:border-indigo-300 hover:bg-indigo-50/40`}
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
