import type { GateTransportLeg, GateTripSource } from "../schemas/gateMovement.schema";
import type { DockSettings } from "./settingsRules";
import type { PickupRow } from "./pickupPin";
import { DOCK_SLOT_DEFAULT_MIN } from "./dockSlots";

// What a Trucking trip fills in the warehouse (expect-arrival / expect-departure) carries a
// `source: { kind: "trucking", tripRef }` marker: the IN / OUT transport leg, the shipment's
// pick-up row and the dock slot (its trip_ref column). Marked data is read-only for people — in
// Warehouse and in Shipments it shows "From trip LCZ…" — and only that trip's cancel clears it.
// A stamp is never touched. Pure helpers (no database, no Encore runtime).

export const TRIP_SOURCE_KIND = "trucking" as const;
/** Longest trip reference accepted (LCZ… numbers are far shorter). */
export const MAX_TRIP_REF = 40;
const MAX_FIELD = 200;

export const tripSource = (tripRef: string): GateTripSource => ({ kind: TRIP_SOURCE_KIND, tripRef });

/** A well-formed trip marker (anything else is not one). */
export function isTripSource(v: unknown): v is GateTripSource {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return o.kind === TRIP_SOURCE_KIND && typeof o.tripRef === "string" && !!o.tripRef.trim();
}

/** Filled by a trip (with `tripRef`: by that trip). */
export const fromTrip = (x: { source?: unknown } | null | undefined, tripRef?: string): boolean =>
  !!x && isTripSource(x.source) && (tripRef === undefined || x.source.tripRef === tripRef);

/** "From trip LCZ…" — what the UIs show next to marked data. */
export const tripLabel = (source: GateTripSource) => `From trip ${source.tripRef}`;

const clip = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX_FIELD) : "");

// ─── transport legs ──────────────────────────────────────────

const blankLeg = (leg: GateTransportLeg["leg"]): GateTransportLeg => ({ leg, company: "", plate: "", driver: "", phone: "", gateTime: "" });

/**
 * A save from Warehouse: legs a trip filled stay exactly as stored (read-only); the others are
 * taken from the save, without any marker the client sent.
 */
export function protectTripLegs(stored: GateTransportLeg[] | null | undefined, incoming: GateTransportLeg[]): GateTransportLeg[] {
  return incoming.map((l) => {
    const kept = (stored ?? []).find((s) => s.leg === l.leg);
    if (kept && fromTrip(kept)) return kept;
    const { source: _source, ...plain } = l;
    return plain;
  });
}

export interface TripLegData {
  company: string;
  plate: string;
  driver: string;
  phone: string;
  /** ISO, the planned gate time. */
  gateTime: string;
}

/** `legs` with `leg` filled by `tripRef` (marked); the other legs as they are. */
export function fillTripLeg(legs: GateTransportLeg[], leg: GateTransportLeg["leg"], tripRef: string, d: TripLegData): GateTransportLeg[] {
  const filled: GateTransportLeg = {
    leg,
    company: clip(d.company),
    plate: clip(d.plate),
    driver: clip(d.driver),
    phone: clip(d.phone),
    gateTime: d.gateTime,
    source: tripSource(tripRef),
  };
  return legs.some((l) => l.leg === leg) ? legs.map((l) => (l.leg === leg ? filled : l)) : [...legs, filled];
}

/** `legs` with `leg` blank again — only when `tripRef` filled it; otherwise unchanged. */
export function clearTripLeg(legs: GateTransportLeg[], leg: GateTransportLeg["leg"], tripRef: string): GateTransportLeg[] {
  return legs.map((l) => (l.leg === leg && fromTrip(l, tripRef) ? blankLeg(leg) : l));
}

/** The leg's fields that matter (marker included), to tell whether a fill changes anything. */
export const sameLeg = (a: GateTransportLeg | undefined, b: GateTransportLeg | undefined) =>
  JSON.stringify(a ? [a.company, a.plate, a.driver, a.phone, a.gateTime, a.source ?? null] : null) ===
  JSON.stringify(b ? [b.company, b.plate, b.driver, b.phone, b.gateTime, b.source ?? null] : null);

// ─── pick-up rows (Shipments → Warehouse → Pick-up) ──────────

/**
 * A save from Shipments: the rows a trip filled stay as stored (read-only, first); the user's rows
 * follow. Rows the client sent with a trip marker are the trip's — echoed back, not the user's —
 * and are dropped (so they are neither doubled nor forged).
 */
export function mergeUserPickupRows(stored: PickupRow[], input: PickupRow[]): PickupRow[] {
  return [...stored.filter((r) => fromTrip(r)), ...input.filter((r) => !fromTrip(r)).map(({ source: _s, ...r }) => r)];
}

/** The rows with `tripRef`'s row set (one row per trip, replacing its earlier one). */
export function setTripPickupRow(rows: PickupRow[], tripRef: string, d: { haulier: string; licensePlate: string; driver: string }): PickupRow[] {
  const row: PickupRow = { haulier: clip(d.haulier), licensePlate: clip(d.licensePlate), driver: clip(d.driver), source: tripSource(tripRef) };
  const i = rows.findIndex((r) => fromTrip(r, tripRef));
  if (i >= 0) return rows.map((r, idx) => (idx === i ? row : r));
  // Trip rows first (in the order the trips came), then the rows typed in Shipments.
  return [...rows.filter((r) => fromTrip(r)), row, ...rows.filter((r) => !fromTrip(r))];
}

/** The rows without `tripRef`'s rows. */
export const clearTripPickupRows = (rows: PickupRow[], tripRef: string): PickupRow[] => rows.filter((r) => !fromTrip(r, tripRef));

// ─── dock slot ───────────────────────────────────────────────

const PRAGUE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * The dock slot a trip's expected time asks for (Prague date and time, the default duration), or
 * why the docks cannot take it then: a day the docks do not work, or outside the opening hours
 * (the slot must end by closing time).
 */
export function tripSlotWindow(
  expectedAt: Date,
  docks: Pick<DockSettings, "opensAt" | "closesAt" | "workingDays">,
  durationMin = DOCK_SLOT_DEFAULT_MIN,
): { date: string; time: string; durationMin: number } | { reason: string } {
  const p = Object.fromEntries(PRAGUE.formatToParts(expectedAt).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  const time = `${p.hour}:${p.minute}`;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  if (!docks.workingDays.includes(weekday)) return { reason: `the docks do not work on ${date}` };
  const start = minutesOf(time);
  if (start < minutesOf(docks.opensAt) || start + durationMin > minutesOf(docks.closesAt)) {
    return { reason: `${time} is outside the dock hours ${docks.opensAt}–${docks.closesAt}` };
  }
  return { date, time, durationMin };
}
