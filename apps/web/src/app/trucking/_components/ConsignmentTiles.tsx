"use client";

import { Tooltip } from "antd";
import type { ConsignmentCounts } from "@/hooks/useTruckingConsignments";
import { CONSIGNMENT_TILES } from "../_lib/consignments";

export type ConsignmentTileId = (typeof CONSIGNMENT_TILES)[number]["id"];

interface ConsignmentTilesProps {
  active: ConsignmentTileId | null;
  counts: ConsignmentCounts | null;
  onSelect: (id: ConsignmentTileId | null) => void;
}

// The three tiles over the Consignments grid (same tiles as the Hauliers and Warehouse lists):
// click to filter, again to clear. Counts come from the server.
export const ConsignmentTiles = ({ active, counts, onSelect }: ConsignmentTilesProps) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
    {CONSIGNMENT_TILES.map((tile) => {
      const on = active === tile.id;
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
              <span className={`text-[22px] leading-tight font-bold tabular-nums ${on ? "text-indigo-700" : "text-slate-900"}`}>{counts ? counts[tile.id] : "—"}</span>
            </div>
          </button>
        </Tooltip>
      );
    })}
  </div>
);
