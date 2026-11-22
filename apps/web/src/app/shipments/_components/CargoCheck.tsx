import { Tooltip } from "antd";
import { FIGURE_TOLERANCE, fmtFixed, type FigureCheck } from "@/lib/cargo";

// The check of cargo lines against what their container declares, the same in Cargo Details
// and the grid's Dimensions dialog.

// The shape of a check pill; the colours come from whoever draws it (also a plain total, such
// as the invoice value in Cargo Details, which nothing declares).
export const CHECK_PILL_CLASS = "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ring-1 ring-inset tabular-nums whitespace-nowrap cursor-default";

// "Booked": the shipment's Booked Dimensions, the lines of the quote it was made from (owner's answer 22 Nov).
export type CheckAgainst = "Container" | "Shipment" | "Booked" | "No container";

interface CheckPillProps {
  label: string;
  m: FigureCheck;
  decimals: number;
  unit?: string;
  /** What declares the figure, for the hover text: a container, a shipment with none, or nothing (lines outside the containers). */
  against?: CheckAgainst;
  /** What the left figure sums, for the hover text: the table's own lines, or (under Booked Dimensions) the Dimensions. */
  sumLabel?: string;
}

/** One figure: what the lines add up to / what the container declares - green when they
 * agree (the volume within 1 %, FIGURE_TOLERANCE; the weight exactly, mock council R19), red when not (also lines with a figure
 * the container does not declare, as the tab's Matched / Mismatch dot counts it), grey when neither
 * has one - and grey when there is nothing to compare with: a shipment with no container that
 * doesn't declare the figure, or lines outside the containers (user council O22). Hovering says
 * which number is which ("Lines: 11 · Container: 11"). */
export function CheckPill({ label, m, decimals, unit = "", against = "Container", sumLabel = "Lines" }: CheckPillProps) {
  const declared = !!m.declared;
  const nothingToCompare = !declared && against !== "Container";
  const tone = m.empty || nothingToCompare
    ? "bg-slate-50 text-slate-500 ring-slate-200"
    : m.ok
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : "bg-red-50 text-red-700 ring-red-200";
  const u = unit ? ` ${unit}` : "";
  const explain = `${sumLabel}: ${fmtFixed(m.sum, decimals)}${u} · ${against}: ${declared ? `${fmtFixed(m.declared, decimals)}${u}` : "not declared"}${m.near ? ` · within ${FIGURE_TOLERANCE * 100} %` : ""}`;
  return (
    <Tooltip title={explain}>
      <span className={`${CHECK_PILL_CLASS} ${tone}`}>
        <span className="font-semibold uppercase tracking-wide text-[10px] opacity-80">{label}</span>
        <span className="font-semibold">{fmtFixed(m.sum, decimals)}</span>
        <span className="opacity-70">
          / {declared ? fmtFixed(m.declared, decimals) : "—"}
          {u}
        </span>
      </span>
    </Tooltip>
  );
}
