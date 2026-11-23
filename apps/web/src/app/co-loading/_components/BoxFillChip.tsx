"use client";

import { Tooltip } from "antd";
import { EMPTY, LABEL_TEXT } from "@/styles/ui";
import { fillWords, type BoxFill } from "../_lib/boxUtilization";

const TONE = { room: "bg-indigo-500", nearly_full: "bg-amber-500", over: "bg-red-500", beyond: "bg-red-500" } as const;

/** One small bar with its letter and its percentage, in the Trucking trip bars' look. */
function Bar({ letter, meter }: { letter: string; meter: NonNullable<BoxFill["volume"]> }) {
  const over = meter.pct > 100;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-3 shrink-0 ${LABEL_TEXT}`}>{letter}</span>
      <span className="relative h-2 w-14 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        {/* The width is the figure itself: the only inline style. */}
        <span className={`absolute inset-y-0 left-0 rounded-full ${TONE[meter.state]}`} style={{ width: `${Math.min(100, meter.pct)}%` }} />
      </span>
      <span className={`w-10 text-[11px] font-semibold tabular-nums ${over ? "text-red-600" : "text-slate-700"}`}>{meter.pct}%</span>
    </span>
  );
}

// How full a sailing's box is, in short: a bar for volume (V) and one for weight (W), with their
// percentages. The whole of it is said in words on hover and to screen readers; "Over" stands in
// words beside a box past a limit, so colour is never the only sign.
export function BoxFillChip({ fill }: { fill: BoxFill }) {
  const words = fillWords(fill);
  if (!fill.volume && !fill.weight) {
    return (
      <Tooltip title={words}>
        <span className={`${EMPTY} text-[12px]`}>No capacity known</span>
      </Tooltip>
    );
  }
  const over = (fill.fullPct ?? 0) > 100;
  return (
    <Tooltip title={words}>
      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-0.5" role="img" aria-label={`Box utilization: ${words}`}>
        {fill.volume && <Bar letter="V" meter={fill.volume} />}
        {fill.weight && <Bar letter="W" meter={fill.weight} />}
        {over && <span className="text-[11px] font-semibold text-red-600">Over</span>}
        {fill.missing > 0 && <span className="text-[11px] font-medium text-amber-700">figures missing</span>}
      </span>
    </Tooltip>
  );
}
