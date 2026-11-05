"use client";

import { Tooltip } from "antd";
import { KPI_VALUE, LABEL_TEXT } from "@/styles/ui";
import { HAULIER_STATUS_CHIP, type HaulierStatus } from "../_lib/hauliers";

const BUBBLE_ORDER: HaulierStatus[] = ["blocked", "warning", "ok"];

interface HaulierFilterBubblesProps {
  active: HaulierStatus | null;
  counts: Record<HaulierStatus, number>;
  onSelect: (status: HaulierStatus | null) => void;
}

// Status tiles over the Hauliers grid (same tiles as the Warehouse worklist): click to filter, again to clear.
// The chosen tile shows in its indigo frame; label and figure keep the app's label and KPI type.
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
              <span className={LABEL_TEXT}>{chip.label}:</span>
              <span className={KPI_VALUE}>{counts[status]}</span>
            </div>
          </button>
        </Tooltip>
      );
    })}
  </div>
);
