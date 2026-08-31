"use client";

import { Tooltip } from "antd";
import { useShipmentTileCounts } from "@/hooks/useShipmentTileCounts";

export type TileId = "active" | "attention" | "import" | "export" | "week" | "nextweek";

interface TileDef {
  id: TileId;
  label: string;
  hint: string;
  /** Tiles that flag a problem render their number in red. */
  danger?: boolean;
}

// Mirrors DASH_TILES from the approved mockup.
const TILES: TileDef[] = [
  { id: "active", label: "Active Shipments", hint: "Everything except invoiced shipments" },
  { id: "attention", label: "Needs Attention", hint: "Open tasks with an ETA within 3 days", danger: true },
  { id: "import", label: "Imports", hint: "Import shipments" },
  { id: "export", label: "Exports", hint: "Export shipments" },
  { id: "week", label: "Upcoming This Week", hint: "ETA/ETD falls in the current week" },
  { id: "nextweek", label: "Upcoming Next Week", hint: "ETA/ETD falls in the next week" },
];

interface Props {
  /** Currently selected tile, or null when none is active. */
  active: TileId | null;
  /** Clicking the active tile clears it (toggle). */
  onSelect: (tile: TileId | null) => void;
}

export function OverviewTiles({ active, onSelect }: Props) {
  const { counts, isLoading } = useShipmentTileCounts();

  const valueFor = (id: TileId): string => {
    if (!counts) return isLoading ? "…" : "0";
    const map: Record<TileId, number> = {
      active: counts.active,
      attention: counts.attention,
      import: counts.import,
      export: counts.export,
      week: counts.week,
      nextweek: counts.nextWeek,
    };
    return String(map[id] ?? 0);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {TILES.map((t) => {
        const on = active === t.id;
        return (
          <Tooltip key={t.id} title={t.hint} mouseEnterDelay={0.4}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(on ? null : t.id)}
              className={[
                "flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[13px] transition-colors cursor-pointer",
                on
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
              ].join(" ")}
            >
              <span className="font-medium">{t.label}:</span>
              <span
                className={[
                  "font-bold tabular-nums",
                  t.danger && Number(valueFor(t.id)) > 0 ? "text-red-600" : on ? "text-indigo-700" : "text-slate-900",
                ].join(" ")}
              >
                {valueFor(t.id)}
              </span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
