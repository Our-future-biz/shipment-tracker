"use client";

import { Tooltip } from "antd";
import type { interfaces } from "@/lib/api/client";
import { nf } from "@/app/warehouse/gate-log/_lib/gate";
import { fillPct, fillTone } from "@/app/warehouse/_lib/containerPlan";

type Totals = Pick<interfaces.WarehouseContainerTotals, "cbm" | "kg" | "capacityCbm" | "capacityKg" | "fillCbmPct" | "fillKgPct" | "overCapacity">;

// The fill of a container against the capacity of its type: the fuller of volume and weight as a
// bar, both in the tooltip. Over capacity is a warning (red), not a block.
export function FillBar({ totals, compact }: { totals: Totals; compact?: boolean }) {
  const pct = fillPct(totals);
  if (pct == null) return <span className="text-slate-300 text-xs">{compact ? "—" : "No capacity known for this type"}</span>;
  const tip = [
    totals.capacityCbm ? `Volume ${nf(totals.cbm, 2)} of ${nf(totals.capacityCbm)} cbm (${totals.fillCbmPct ?? 0} %)` : "",
    totals.capacityKg ? `Weight ${nf(totals.kg)} of ${nf(totals.capacityKg)} kg (${totals.fillKgPct ?? 0} %)` : "",
    totals.overCapacity ? "Over capacity" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Tooltip title={tip}>
      <span className={`inline-flex items-center gap-2 ${compact ? "w-[110px]" : "w-full"}`}>
        <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Fill">
          <span className={`absolute inset-y-0 left-0 rounded-full ${fillTone(pct)}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </span>
        <span className={`text-[11px] tabular-nums font-semibold ${totals.overCapacity ? "text-red-600" : "text-slate-600"}`}>{pct} %</span>
      </span>
    </Tooltip>
  );
}
