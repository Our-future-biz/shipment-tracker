"use client";

import { Tooltip } from "antd";
import { CHIP, CHIP_ON } from "@/styles/ui";
import { HAULIER_CHIPS, type HaulierChipId } from "../_lib/hauliers";

interface HaulierQuickChipsProps {
  active: HaulierChipId | null;
  counts: Record<HaulierChipId, number>;
  onSelect: (id: HaulierChipId | null) => void;
}

// Quick filters of the Hauliers worklist (?view=), with live counts; one at a time, combined with the tiles.
// The look of the Shipments overview tiles (PillTabs).
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
            className={`${CHIP} ${on ? CHIP_ON : ""}`}
          >
            {c.label}
            <span className={`font-bold tabular-nums ${c.danger && n > 0 ? "text-red-600" : on ? "text-indigo-700" : "text-slate-900"}`}>{n}</span>
          </button>
        </Tooltip>
      );
    })}
  </div>
);
