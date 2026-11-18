import { CARD, LABEL_TEXT } from "@/styles/ui";

// The lines under a managers' cockpit's cards. CockpitLine is a quiet line of figures with a label
// in front (Sales' audit and team lines); CockpitNote is a line that reports a state and may wear
// a warning colour (what keeps the figures from being whole, what was not delivered).

/** A labelled line of figures: "AUDIT · LAST 30 DAYS   Asked 4   Approved 3 …". */
export function CockpitLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-wrap items-baseline gap-x-5 gap-y-1 ${CARD} px-4 py-2 text-xs text-slate-700`}>
      <span className={LABEL_TEXT}>{label}</span>
      {children}
    </div>
  );
}

/** One figure of a CockpitLine; `hot` draws it red. */
export const CockpitFigure = ({ label, value, hot }: { label: string; value: React.ReactNode; hot?: boolean }) => (
  <span>
    {label} <b className={`tabular-nums ${hot ? "text-red-600" : "text-slate-900"}`}>{value}</b>
  </span>
);

/** A note's colours: `frame` is its border and background, `text` its text. */
export interface CockpitNoteTone {
  frame: string;
  text: string;
}

export const NOTE_TONES = {
  plain: { frame: "border-slate-200 bg-white", text: "text-slate-700" },
  amber: { frame: "border-amber-200 bg-amber-50", text: "text-amber-700" },
  red: { frame: "border-red-200 bg-red-50", text: "text-red-700" },
} satisfies Record<string, CockpitNoteTone>;

/**
 * A line that reports a state (role="status"), its parts side by side and wrapping. `tight` sets
 * the parts closer, for a line that reads as one sentence.
 */
export function CockpitNote({ tone = NOTE_TONES.plain, tight, children }: { tone?: CockpitNoteTone; tight?: boolean; children: React.ReactNode }) {
  return (
    <div role="status" className={`flex flex-wrap items-center ${tight ? "gap-x-2" : "gap-x-6"} gap-y-1 rounded-xl border ${tone.frame} px-4 py-2 text-xs ${tone.text}`}>
      {children}
    </div>
  );
}
