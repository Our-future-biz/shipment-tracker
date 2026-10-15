"use client";

import { Tooltip } from "antd";
import { HAULIER_CHIPS, type HaulierChipId } from "../_lib/hauliers";

interface HaulierQuickChipsProps {
  active: HaulierChipId | null;
  counts: Record<HaulierChipId, number>;
  onSelect: (id: HaulierChipId | null) => void;
}

// Quick filters of the Hauliers worklist (?view=), with live counts; one at a time, combined with the tiles.
export const HaulierQuickChips = ({ active, counts, onSelect }: HaulierQuickChipsProps) => (
  <div role="group" aria-label="Quick filters" className="flex flex-wrap gap-2 mt-3">
    {HAULIER_CHIPS.map((c) => {
      const on = active === c.id;
      const n = counts[c.id];
      return (
        <Tooltip key={c.id} title={c.hint} mouseEnterDelay={0.4}>
          <button
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(on ? null : c.id)}
            className={[
              "inline-flex items-center gap-1.5 rounded-full border px-3 h-7 text-[12.5px] font-medium transition-colors cursor-pointer",
              on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
            ].join(" ")}
          >
            {c.label}
            <span className={`tabular-nums font-semibold ${c.danger && n > 0 ? "text-red-600" : on ? "text-indigo-700" : "text-slate-500"}`}>{n}</span>
          </button>
        </Tooltip>
      );
    })}
  </div>
);
