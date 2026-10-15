"use client";

import { Tooltip } from "antd";
import { HAULIER_STATUS_CHIP, type HaulierStatus } from "../_lib/hauliers";

const BUBBLE_ORDER: HaulierStatus[] = ["blocked", "warning", "ok"];

interface HaulierFilterBubblesProps {
  active: HaulierStatus | null;
  counts: Record<HaulierStatus, number>;
  onSelect: (status: HaulierStatus | null) => void;
}

// Status tiles over the Hauliers grid (same tiles as the Warehouse worklist): click to filter, again to clear.
export const HaulierFilterBubbles = ({ active, counts, onSelect }: HaulierFilterBubblesProps) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
    {BUBBLE_ORDER.map((status) => {
      const on = active === status;
      const chip = HAULIER_STATUS_CHIP[status];
      return (
        <Tooltip key={status} title={chip.hint} mouseEnterDelay={0.4}>
          <button
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(on ? null : status)}
            className={[
              "w-full text-left rounded-xl border shadow-sm px-4 py-3 min-w-0 transition-colors cursor-pointer",
              on ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
            ].join(" ")}
          >
            <div className="flex items-baseline gap-2">
              <span className={`text-[15px] font-bold uppercase tracking-wide ${on ? "text-indigo-600" : "text-slate-500"}`}>{chip.label}:</span>
              <span className={`text-[22px] leading-tight font-bold tabular-nums ${on ? "text-indigo-700" : "text-slate-900"}`}>{counts[status]}</span>
            </div>
          </button>
        </Tooltip>
      );
    })}
  </div>
);
