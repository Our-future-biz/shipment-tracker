"use client";

import { Tooltip } from "antd";
import type { ConsignmentCounts } from "@/hooks/useTruckingConsignments";
import { CHIP, CHIP_ON } from "@/styles/ui";
import { CONSIGNMENT_CHIPS, type ChipView } from "../_lib/consignments";

interface ConsignmentQuickChipsProps {
  active: ChipView | null;
  counts: ConsignmentCounts | null;
  onSelect: (id: ChipView | null) => void;
}

// Quick filters of the Consignments worklist (?view=), with the server's counts; one at a time.
// The look of the Shipments overview tiles (PillTabs).
export const ConsignmentQuickChips = ({ active, counts, onSelect }: ConsignmentQuickChipsProps) => (
  <div role="group" aria-label="Quick filters" className="flex flex-wrap gap-2 mt-3">
    {CONSIGNMENT_CHIPS.map((c) => {
      const on = active === c.id;
      const n = counts ? counts[c.id] : null;
      return (
        <Tooltip key={c.id} title={c.hint} mouseEnterDelay={0.4}>
          <button
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(on ? null : c.id)}
            className={`${CHIP} ${on ? CHIP_ON : ""}`}
          >
            {c.label}
            <span className={`font-bold tabular-nums ${c.danger && n ? "text-red-600" : on ? "text-indigo-700" : "text-slate-900"}`}>{n ?? "—"}</span>
          </button>
        </Tooltip>
      );
    })}
  </div>
);
