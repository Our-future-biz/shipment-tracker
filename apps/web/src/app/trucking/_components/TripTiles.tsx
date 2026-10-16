"use client";

import { Tooltip } from "antd";
import { TRIP_TILES, type TripView } from "../_lib/trips";

interface TripTilesProps {
  active: TripView | null;
  counts: Record<TripView, number> | null;
  onSelect: (view: TripView | null) => void;
}

// The work queues over the Trips grid (same tiles as the Consignments list): click to filter, again
// to clear. A queue that needs the haulier chased shows its count red.
export const TripTiles = ({ active, counts, onSelect }: TripTilesProps) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
    {TRIP_TILES.map((tile) => {
      const on = active === tile.id;
      const n = counts ? counts[tile.id] : null;
      return (
        <Tooltip key={tile.id} title={tile.hint} mouseEnterDelay={0.4}>
          <button
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(on ? null : tile.id)}
            className={[
              "w-full text-left rounded-xl border shadow-sm px-4 py-3 min-w-0 transition-colors cursor-pointer",
              on ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
            ].join(" ")}
          >
            <div className="flex items-baseline gap-2">
              <span className={`text-[15px] font-bold uppercase tracking-wide ${on ? "text-indigo-600" : "text-slate-500"}`}>{tile.label}:</span>
              <span className={`text-[22px] leading-tight font-bold tabular-nums ${tile.danger && n ? "text-red-600" : on ? "text-indigo-700" : "text-slate-900"}`}>{n ?? "—"}</span>
            </div>
          </button>
        </Tooltip>
      );
    })}
  </div>
);
