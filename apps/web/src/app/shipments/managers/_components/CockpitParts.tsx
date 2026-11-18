"use client";

import type { ReactNode } from "react";
import { Tooltip } from "antd";
import { XIcon } from "@phosphor-icons/react";
import { Pill } from "@/components/Pill";
import { BTN, EMPTY, HINT, LABEL_TEXT } from "@/styles/ui";
import { modeLabel } from "../_lib/cockpitAddress";
import { showingLabel, tagsShown, type SignalFamily } from "../_lib/cockpitSignals";
import { teamFigure } from "../_lib/cockpitTeam";

// What the tabs of Shipments → Managers draw alike: a row's mode chip and tags (the Cockpit's
// cards and the Money tab's), a signal tile and the chip that says what the cards are narrowed to,
// a figure of a people table (the Team tab's and the Money tab's).

export const dash = <span className={EMPTY}>—</span>;
export const NOBODY_TEXT = "text-red-600 font-medium";

/** The company's clock, wherever the manager sits: "14:05". */
export const PRAGUE_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// A job with no Freight Mode gets no chip.
export const modeChip = (r: { mode: string }) => {
  const label = modeLabel(r.mode);
  return label ? <Pill tone="slate">{label}</Pill> : null;
};

/** A row's tag as the server sends it. */
interface RowTag {
  text: string;
  urgent: boolean;
  kind?: string;
}

// A job can carry six or eight signals. A card's row shows the first few and how many more there
// are (their words on hover); the dialog shows them all. Narrowed to a signal, that signal's tags
// come first.
export const tagList = (r: { tags: readonly RowTag[] }, signal: SignalFamily | null, limit?: number) => {
  const { shown, more } = tagsShown(r.tags, signal, limit);
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((t, i) => (
        <Pill key={i} tone={t.urgent ? "red" : "amber"} className="max-w-full !whitespace-normal break-words">
          {t.text}
        </Pill>
      ))}
      {more.length > 0 && (
        <Pill tone="slate" title={more.map((t) => t.text).join("\n")}>
          +{more.length} more
        </Pill>
      )}
    </div>
  );
};

// The tiles' box is the app's button, as CockpitTiles draws its own; a signal tile that is on
// wears the colours of a chip that is on (CHIP_ON).
const SIGNAL_TILE = `${BTN} !text-slate-700 hover:!text-slate-900`;
const SIGNAL_TILE_ON = "!border-indigo-500 !bg-indigo-50 hover:!bg-indigo-50";

interface SignalTileProps {
  family: SignalFamily;
  /** The figure as shown ("12", "12+", "–", "…"). */
  value: string;
  /** Red figure: the tile counts something. */
  hot: boolean;
  /** The cards are narrowed to this family. */
  on: boolean;
  /** Narrows the cards to the family, or shows them whole again. */
  onToggle: () => void;
  /** Said on hover under the family's own hint: why the tile has no figure ("Could not be read right now"). */
  notKnown?: string;
}

// A signal tile narrows the two cards on its tab to the jobs it counts. A zero stays on screen -
// "none" is an answer - but is not red.
export function SignalTile({ family, value, hot, on, onToggle, notKnown }: SignalTileProps) {
  return (
    <Tooltip
      mouseEnterDelay={0.4}
      title={
        <>
          {family.hint}
          {family.note && <div>{family.note}</div>}
          {notKnown && <div>{notKnown}</div>}
          <div>{on ? "Click again to show every job." : "Click to show only these jobs on the cards."}</div>
        </>
      }
    >
      <button type="button" aria-pressed={on} aria-label={`${family.label}: ${notKnown ? `${value} (${notKnown})` : value}`} onClick={onToggle} className={`${SIGNAL_TILE} ${on ? SIGNAL_TILE_ON : ""}`}>
        <span className="font-medium">{family.label}:</span>
        <span className={`font-bold tabular-nums ${hot ? "text-red-600" : "text-slate-900"}`}>{value}</span>
      </button>
    </Tooltip>
  );
}

export function TileGroup({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={`${label}: ${title}`} className="flex flex-col sm:flex-row sm:items-start gap-x-3 gap-y-1">
      {/* As high as a tile, so the name sits on the first row's line. */}
      <span title={title} className={`${LABEL_TEXT} !text-slate-500 shrink-0 sm:w-14 sm:h-8 flex items-center`}>
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// What the cards are narrowed to, and the way out: the chip of the Shipments list's own filters.
export function SignalChip({ signal, onClear }: { signal: SignalFamily; onClear: () => void }) {
  const label = showingLabel(signal);
  return (
    <div role="group" aria-label="Signal the cards are narrowed to" className="flex flex-wrap items-center gap-2">
      <span className={HINT}>Showing only:</span>
      <span className="inline-flex max-w-full items-center gap-1 h-7 pl-2.5 pr-1 rounded-lg border border-indigo-200 bg-indigo-50 text-[12px] font-medium text-indigo-700">
        <span className="truncate">{label}</span>
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear filter ${label}`}
          title="Show every job"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded cursor-pointer text-indigo-500 hover:bg-indigo-100 hover:text-indigo-800 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <XIcon size={12} weight="bold" aria-hidden />
        </button>
      </span>
    </div>
  );
}

// A figure in a people table: "–" when it was not read, quiet when it is none, in its colour when it counts something.
export const figure = (value: number | null, hot = "text-slate-900") => (
  <span className={`tabular-nums ${value === null ? "text-slate-400" : value > 0 ? `font-semibold ${hot}` : "text-slate-400"}`} aria-label={value === null ? "Not known" : undefined}>
    {teamFigure(value)}
  </span>
);

/** A column's header with what it counts on hover. */
export const columnHead = (label: string, hint: string) => <span title={hint}>{label}</span>;
