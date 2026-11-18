"use client";

import Link from "next/link";
import { Tooltip } from "antd";
import { BTN } from "@/styles/ui";

// The tile row on top of a managers' cockpit: one figure per tile ("Open quotes: 12"), red when
// the tile is a danger and counts something. A tile leads to the list behind its figure, or is
// plain text. The page works out label, figure and link for its own tiles; the row only draws them.

export interface CockpitTile {
  key: string;
  label: string;
  /** The figure as shown; take it from tileValue so a failed load never reads as 0. */
  value: string;
  /** Red figure. */
  hot?: boolean;
  /** Where the tile leads; without it the tile is plain text. */
  href?: string;
  /** What a screen reader says for a link; "<label>: <value>" when left out. */
  ariaLabel?: string;
  /** Shown on hover. */
  hint?: React.ReactNode;
}

/** A tile's classes: `link` for one that leads somewhere, `plain` for one that does not. */
export interface CockpitTileLook {
  link: string;
  plain: string;
}

/** The look of Sales → Managers, the app's button: what a new page takes. */
const COCKPIT_TILE_LOOK: CockpitTileLook = {
  link: `${BTN} !text-slate-700 hover:!text-slate-900`,
  // The same box without what says "click me".
  plain: `${BTN} !text-slate-700 !cursor-default hover:!bg-white`,
};

/**
 * A tile's figure. While the answer is not there it reads "…" (loading) or "–" (failed): a failed
 * request must not read as "nothing to do".
 */
export const tileValue = <C,>(cockpit: C | null, state: { isLoading: boolean; isError: boolean }, value: (cockpit: C) => string): string =>
  cockpit ? value(cockpit) : state.isLoading ? "…" : state.isError ? "–" : "0";

function Tile({ tile, look }: { tile: CockpitTile; look: CockpitTileLook }) {
  const { label, value, hot, href, hint } = tile;
  const ariaLabel = tile.ariaLabel ?? `${label}: ${value}`;
  const body = (
    <>
      <span className="font-medium">{label}:</span>
      <span className={`font-bold tabular-nums ${hot ? "text-red-600" : "text-slate-900"}`}>{value}</span>
    </>
  );
  const box = href ? (
    <Link href={href} aria-label={ariaLabel} className={look.link}>
      {body}
    </Link>
  ) : (
    <span className={look.plain}>{body}</span>
  );
  return hint ? (
    <Tooltip title={hint} mouseEnterDelay={0.4}>
      {box}
    </Tooltip>
  ) : (
    box
  );
}

export function CockpitTiles({ tiles, look = COCKPIT_TILE_LOOK }: { tiles: CockpitTile[]; look?: CockpitTileLook }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {tiles.map((t) => (
        <Tile key={t.key} tile={t} look={look} />
      ))}
    </div>
  );
}
