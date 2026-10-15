"use client";

import { Tooltip } from "antd";
import type { TripFill } from "@/hooks/useTruckingConsignments";
import { TERMS } from "../_lib/glossary";
import { tripFillPercent, tripFillTone, type Capacity } from "../_lib/planning";
import { formatQty } from "../_lib/tariffs";

interface TripFillBarsProps {
  fill: TripFill;
  capacity: Capacity | null;
  compact?: boolean;
}

interface BarProps {
  label: string;
  value: number;
  of: number | null;
  unit: string;
  pct: number | null;
  tone: string;
  compact: boolean;
}

// One bar in the Warehouse FillBar's look (container/FillBar.tsx); the colour is the trip's, not its own.
const Bar = ({ label, value, of, unit, pct, tone, compact }: BarProps) => (
  <Tooltip title={of ? `${label} ${formatQty(value)} of ${formatQty(of)} ${unit} (${pct ?? 0} %)` : `${label} ${formatQty(value)} ${unit} — capacity not known`}>
    <span className={`inline-flex items-center gap-2 ${compact ? "w-[150px]" : "w-full"}`}>
      <span className="w-7 shrink-0 text-[10px] font-bold uppercase text-slate-500">{label}</span>
      <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? 0} aria-label={`${TERMS.fill} ${label}`}>
        <span className={`absolute inset-y-0 left-0 rounded-full ${tone}`} style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
      </span>
      <span className={`w-10 text-right text-[11px] font-semibold tabular-nums ${(pct ?? 0) > 100 ? "text-red-600" : "text-slate-600"}`}>{pct == null ? "—" : `${pct} %`}</span>
    </span>
  </Tooltip>
);

// The fill of a trip as two bars, LDM and kg. The fuller of the two sets the colour of both (amber
// from 90 %, red over 100 %); over capacity is a warning, never a block.
export const TripFillBars = ({ fill, capacity, compact = false }: TripFillBarsProps) => {
  const tone = tripFillTone(fill);
  const fuller = tripFillPercent(fill);
  return (
    <span className="flex flex-col gap-1" aria-label={fuller == null ? TERMS.fill : `${TERMS.fill} ${fuller} %`}>
      <Bar label={TERMS.ldm} value={fill.ldm} of={capacity?.ldm ?? null} unit={TERMS.ldm} pct={fill.ldmPercent} tone={tone} compact={compact} />
      <Bar label="kg" value={fill.kg} of={capacity?.kg ?? null} unit="kg" pct={fill.kgPercent} tone={tone} compact={compact} />
    </span>
  );
};
