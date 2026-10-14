import type { warehouseDockSlotTable } from "../schemas/warehouseRecords.schema";
import type { GateDockSlot } from "../interfaces/gate.interfaces";
import { pragueHhmm } from "./offline";

// Dock slots: when a dock door is booked for a position. Pure helpers (no database), shared by
// the Dock & Yard records and the gate item.

export type DockSlotRow = typeof warehouseDockSlotTable.$inferSelect;

export const DOCK_SLOT_STATUSES = ["Booked", "In progress", "Completed", "Overdue", "Cancelled"] as const;
/** Statuses that no longer hold the dock door (the overlap rule ignores them). */
export const DOCK_SLOT_FREE_STATUSES = ["Cancelled", "Completed"];
export const DOCK_SLOT_DEFAULT_MIN = 60;
export const DOCK_SLOT_MIN_MIN = 15;
export const DOCK_SLOT_MAX_MIN = 480;
/** New slots must be linked to a position (gate movement); old unlinked slots stay editable. */
export const DOCK_SLOT_NEEDS_POSITION = true;

const PRAGUE_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// Minutes Prague is ahead of UTC at `d`.
function pragueOffsetMin(d: Date) {
  const p = Object.fromEntries(PRAGUE_PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!);
  return Math.round((asUtc - Math.floor(d.getTime() / 60_000) * 60_000) / 60_000);
}

/** The instant of a Prague wall-clock date (YYYY-MM-DD) and time (HH:MM). */
export function pragueInstant(date: string, time: string): Date {
  const wall = Date.parse(`${date}T${time}:00Z`);
  // Two passes settle the offset on either side of a DST change.
  let t = wall - pragueOffsetMin(new Date(wall)) * 60_000;
  t = wall - pragueOffsetMin(new Date(t)) * 60_000;
  return new Date(t);
}

/** Start and end of a slot as instants. */
export function slotWindow(date: string, time: string, durationMin: number) {
  const startsAt = pragueInstant(date, time);
  return { startsAt, endsAt: new Date(startsAt.getTime() + durationMin * 60_000) };
}

/** HH:MM the slot ends (Prague); "" without a start. */
export const slotEnd = (s: Pick<DockSlotRow, "endsAt">) => (s.endsAt ? pragueHhmm(s.endsAt) : "");

/** The direction a slot takes from its position: cargo coming in (příjem) or going out (výdej). */
export const directionOfVisit = (visit: string) => (visit === "výdej" ? "OUT" : "IN");

/** "Dock 2 · 2026-10-14 08:00–09:00" */
export const slotText = (s: Pick<DockSlotRow, "dock" | "date" | "time" | "endsAt">) =>
  `${s.dock} · ${s.date} ${s.time}${s.endsAt ? `–${slotEnd(s)}` : ""}`;

/** Whether a slot still holds its dock door. */
export const slotHoldsDock = (s: Pick<DockSlotRow, "status">) => !DOCK_SLOT_FREE_STATUSES.includes(s.status);

/** The live (not cancelled) slots of one movement as the gate item shows them, earliest first. */
export function dockSlotsOf(rows: DockSlotRow[], movementId: string): GateDockSlot[] {
  return rows
    .filter((s) => s.movementId === movementId && !s.deletedAt && s.status !== "Cancelled")
    .sort((a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0) || a.createdAt.getTime() - b.createdAt.getTime())
    .map((s) => ({
      id: s.id,
      date: s.date,
      time: s.time,
      end: slotEnd(s),
      dock: s.dock,
      direction: s.direction,
      status: s.status,
      durationMin: s.durationMin,
      startsAt: s.startsAt ? s.startsAt.toISOString() : null,
      endsAt: s.endsAt ? s.endsAt.toISOString() : null,
    }));
}
