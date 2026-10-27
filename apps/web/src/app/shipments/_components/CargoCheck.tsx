import { fmtFixed } from "@/lib/cargo";

// The check of cargo lines against what their container declares, the same in Cargo Details
// and the grid's Dimensions dialog.

type Figure = { sum: number; declared: number; empty: boolean; ok: boolean };

/** One figure: what the lines add up to / what the container declares - green when they
 * agree, red when not, grey when the container declares nothing. */
export function CheckPill({ label, m, decimals, unit = "" }: { label: string; m: Figure; decimals: number; unit?: string }) {
  const declared = !!m.declared;
  const tone = !declared
    ? "bg-slate-50 text-slate-500 ring-slate-200"
    : m.ok
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : "bg-red-50 text-red-700 ring-red-200";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ring-1 ring-inset tabular-nums whitespace-nowrap ${tone}`}>
      <span className="font-semibold uppercase tracking-wide text-[10px] opacity-80">{label}</span>
      <span className="font-semibold">{fmtFixed(m.sum, decimals)}</span>
      <span className="opacity-70">
        / {declared ? fmtFixed(m.declared, decimals) : "—"}
        {unit ? ` ${unit}` : ""}
      </span>
    </span>
  );
}

/** Matched / Mismatch for a whole container: a dot and a word. */
export function MatchBadge({ matched }: { matched: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        matched ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${matched ? "bg-emerald-500" : "bg-red-500"}`} />
      {matched ? "Matched" : "Mismatch"}
    </span>
  );
}
