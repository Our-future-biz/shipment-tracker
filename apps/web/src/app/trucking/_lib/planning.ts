import type { RateRequest } from "@/hooks/useTrucking";
import type { ConsignmentDetail, LtlTripKind, PlanningLeg, PlanningTrip, TripDetail, TripFill } from "@/hooks/useTruckingConsignments";
import type { Tone } from "@/components/Badge";
import { dropHouse, fillTone, moveHouse } from "@/app/warehouse/_lib/containerPlan";
import { formatDate } from "@/lib/date";
import { TERMS } from "./glossary";
import { formatQty } from "./tariffs";
import { round2 } from "@/lib/money";

// Pure helpers of LTL planning and the legs of a consignment: the kind switch, unplanned legs by
// zone with their deadline badge, the fill of a trip (the fuller of LDM and kg drives the colour),
// the warnings a change would bring (shown, never blocking), stop order and the legs timeline.
// Tested in planning.test.ts.

export const TRIP_KIND_OPTIONS: { value: LtlTripKind; label: string }[] = [
  { value: "PICKUP_RUN", label: `${TERMS.pickupRun}s` },
  { value: "LINEHAUL", label: `${TERMS.lineHaul}s` },
  { value: "DELIVERY_RUN", label: `${TERMS.deliveryRun}s` },
];

export const TRIP_KIND_LABEL: Record<PlanningTrip["kind"], string> = {
  FTL: TERMS.ftl,
  PICKUP_RUN: TERMS.pickupRun,
  LINEHAUL: TERMS.lineHaul,
  DELIVERY_RUN: TERMS.deliveryRun,
};

/** The leg kind a trip kind carries. */
export const LEG_KIND_OF_TRIP: Record<LtlTripKind, PlanningLeg["kind"]> = { PICKUP_RUN: "PICKUP", LINEHAUL: "LINEHAUL", DELIVERY_RUN: "DELIVERY" };

/** Tariff scope a new trip of a kind is priced with (pick-up and delivery runs: LTL). */
export const TRIP_RATE_SCOPE: Record<LtlTripKind, "LTL" | "LINEHAUL"> = { PICKUP_RUN: "LTL", LINEHAUL: "LINEHAUL", DELIVERY_RUN: "LTL" };

// ── Deadlines ──

export interface DeadlineBadge {
  label: string;
  tone: Tone;
  /** Order in a zone: the most urgent first. */
  rank: number;
}

/** A stop's deadline on a trip card: promised before the trip's day (overdue) or on it (today); null otherwise. */
export function stopDeadline(promisedDate: string | null, tripDate: string): "overdue" | "today" | null {
  if (!promisedDate) return null;
  if (promisedDate < tripDate) return "overdue";
  return promisedDate === tripDate ? "today" : null;
}

/** Overdue and today red, tomorrow amber, later plain. */
export const DEADLINE_BADGE: Record<PlanningLeg["deadline"], DeadlineBadge> = {
  overdue: { label: "Overdue", tone: "r", rank: 0 },
  today: { label: "Today", tone: "r", rank: 1 },
  tomorrow: { label: "Tomorrow", tone: "a", rank: 2 },
  later: { label: "Later", tone: "", rank: 3 },
};

// ── Unplanned legs by zone ──

export interface ZoneGroup {
  zone: string;
  legs: PlanningLeg[];
  palletPlaces: number;
  ldm: number;
  weightKg: number;
  /** The most urgent deadline in the zone. */
  deadline: PlanningLeg["deadline"];
}

const NO_ZONE = "No zone";

/** The legs grouped by zone (by name, "No zone" last); inside a zone the most urgent first, then by promised date and ref. */
export function groupLegsByZone(legs: readonly PlanningLeg[]): ZoneGroup[] {
  const byZone = new Map<string, PlanningLeg[]>();
  for (const leg of legs) {
    const zone = leg.zoneLabel.trim() || NO_ZONE;
    byZone.set(zone, [...(byZone.get(zone) ?? []), leg]);
  }
  const urgent = (a: PlanningLeg, b: PlanningLeg) =>
    DEADLINE_BADGE[a.deadline].rank - DEADLINE_BADGE[b.deadline].rank ||
    (a.promisedDate ?? "9999").localeCompare(b.promisedDate ?? "9999") ||
    a.consignmentRef.localeCompare(b.consignmentRef);
  return [...byZone.entries()]
    .sort(([a], [b]) => (a === NO_ZONE ? 1 : b === NO_ZONE ? -1 : a.localeCompare(b, "cs", { numeric: true })))
    .map(([zone, group]) => {
      const sorted = [...group].sort(urgent);
      return {
        zone,
        legs: sorted,
        palletPlaces: round2(sorted.reduce((s, l) => s + l.palletPlaces, 0)),
        ldm: round2(sorted.reduce((s, l) => s + l.ldm, 0)),
        weightKg: round2(sorted.reduce((s, l) => s + l.weightKg, 0)),
        deadline: sorted[0]!.deadline,
      };
    });
}

// ── Fill ──

/** The fuller of LDM and kg, in whole percent; null when the vehicle's capacity is not known. */
export function tripFillPercent(fill: Pick<TripFill, "ldmPercent" | "kgPercent">): number | null {
  if (fill.ldmPercent == null && fill.kgPercent == null) return null;
  return Math.round(Math.max(fill.ldmPercent ?? 0, fill.kgPercent ?? 0));
}

/** The colour of both fill bars of a trip: the fuller of LDM and kg drives it (Warehouse colours). */
export const tripFillTone = (fill: Pick<TripFill, "ldmPercent" | "kgPercent">) => fillTone(tripFillPercent(fill));

export interface Capacity {
  ldm: number;
  kg: number;
  palletPlaces: number;
}

type Load = Pick<PlanningLeg, "ldm" | "weightKg" | "palletPlaces">;

const percentOf = (value: number, capacity: number) => (capacity > 0 ? Math.round((value / capacity) * 100) : null);

/** The fill of a trip with more legs on it, against its capacity (null capacity = percentages unknown). */
export function projectedFill(fill: Pick<TripFill, "ldm" | "kg" | "palletPlaces">, add: readonly Load[], capacity: Capacity | null): TripFill {
  const ldm = round2(fill.ldm + add.reduce((s, l) => s + l.ldm, 0));
  const kg = round2(fill.kg + add.reduce((s, l) => s + l.weightKg, 0));
  const palletPlaces = round2(fill.palletPlaces + add.reduce((s, l) => s + l.palletPlaces, 0));
  return { ldm, kg, palletPlaces, ldmPercent: capacity ? percentOf(ldm, capacity.ldm) : null, kgPercent: capacity ? percentOf(kg, capacity.kg) : null };
}

// ── Warnings (shown, never blocking) ──

export interface WarningContext {
  capacity: Capacity | null;
  /** The vehicle type has a tail-lift; null = not known. */
  vehicleTailLift: boolean | null;
  /** The haulier may carry ADR; null = not known. */
  haulierAdr: boolean | null;
  /** The trip's date (YYYY-MM-DD). */
  tripDate: string;
}

/**
 * What putting `add` on a trip would bring up, in the words the server uses: over capacity (LDM,
 * kg, pallet places), ADR on a haulier without ADR, tail-lift needed without one, a promised date
 * before the trip. The server's own list (`trip.warnings`) is what counts; this is the preview.
 */
export function addLegsWarnings(fill: Pick<TripFill, "ldm" | "kg" | "palletPlaces">, add: readonly PlanningLeg[], ctx: WarningContext): string[] {
  const out: string[] = [];
  const next = projectedFill(fill, add, ctx.capacity);
  const cap = ctx.capacity;
  if (cap && cap.ldm > 0 && next.ldm > cap.ldm) out.push(`Over capacity: ${formatQty(next.ldm)} of ${formatQty(cap.ldm)} ${TERMS.ldm}`);
  if (cap && cap.kg > 0 && next.kg > cap.kg) out.push(`Over capacity: ${formatQty(next.kg)} of ${formatQty(cap.kg)} kg`);
  if (cap && cap.palletPlaces > 0 && next.palletPlaces > cap.palletPlaces) out.push(`Over capacity: ${formatQty(next.palletPlaces)} of ${formatQty(cap.palletPlaces)} pallet places`);
  for (const leg of add) {
    if (leg.adr && ctx.haulierAdr === false) out.push(`${leg.consignmentRef}: ${TERMS.adr} on a haulier without ${TERMS.adr}`);
    if (leg.tailLift && ctx.vehicleTailLift === false) out.push(`${leg.consignmentRef}: ${TERMS.tailLift.toLowerCase()} needed, the vehicle has none`);
    if (leg.promisedDate && leg.promisedDate < ctx.tripDate) out.push(`${leg.consignmentRef}: promised ${formatDate(leg.promisedDate)}, before the trip`);
  }
  return out;
}

/** "Over capacity: 14.2 of 13.6 LDM +2" for a card's header; null when there is nothing. */
export function warningSummary(warnings: readonly string[]): string | null {
  if (!warnings.length) return null;
  return warnings.length === 1 ? warnings[0]! : `${warnings[0]} +${warnings.length - 1}`;
}

// ── Stops ──

/** The stop order with one stop moved up (-1) or down (+1); unchanged at the ends. */
export const moveStop = (order: string[], legId: string, by: -1 | 1) => moveHouse(order, legId, by);

/** The stop order with one stop dropped before another (drag and drop). */
export const dropStop = (order: string[], dragged: string, before: string) => dropHouse(order, dragged, before);

/** Whether two stop orders differ (nothing is sent when they don't). */
export const orderChanged = (a: readonly string[], b: readonly string[]) => a.join() !== b.join();

/** Where a leg can go from the "Add to trip…" menu: the open trips of the board, not done or cancelled. */
export const openTrips = (trips: readonly PlanningTrip[]) => trips.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED" && t.status !== "IN_TRANSIT");

// ── 409 ──

/** The planning day a ?date= value names (a real YYYY-MM-DD day), else `today`: a shared link opens that day. */
export function planningDayOf(param: string | null, today: string): string {
  if (!param || !/^\d{4}-\d{2}-\d{2}$/.test(param)) return today;
  const d = new Date(`${param}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === param ? param : today;
}

/** The Planning tab on a day (?date=; today keeps the address clean). */
export const planningHref = (day: string | null) => (day ? `/trucking?tab=planning&date=${day}` : "/trucking?tab=planning");

export const PLANNING_CONFLICT_TEXT = "Someone changed this trip meanwhile — the board is reloaded, try again.";

// ── Legs timeline of a consignment ──

export type LegTimelineState = "done" | "current" | "waiting" | "skipped";

export interface LegTimelineStep {
  key: "pickup" | "hub" | "linehaul" | "delivery";
  label: string;
  /** "Pick-up run", "Partner network", "Customer brings goods"… */
  detail: string;
  state: LegTimelineState;
  tripId: string | null;
  tripRef: string | null;
  /** A time to show (the gate-in). */
  at: string | null;
}

type TimelineInput = Pick<ConsignmentDetail, "status" | "legs" | "selfDelivered" | "lastMile" | "gateInAt">;

const AFTER_HUB: readonly string[] = ["ON_LINEHAUL", "OUT_FOR_DELIVERY", "DELIVERED", "POD_RECEIVED", "READY_TO_BILL"];
const DELIVERED: readonly string[] = ["DELIVERED", "POD_RECEIVED", "READY_TO_BILL"];

/**
 * The road of an LTL consignment: Pick-up run → At our warehouse → Line haul → Delivery, each with
 * its trip, from its legs and the gate-in. The first step not done is current.
 */
export function legTimeline(c: TimelineInput): LegTimelineStep[] {
  const leg = (kind: PlanningLeg["kind"]) => c.legs.find((l) => l.kind === kind) ?? null;
  const pickup = leg("PICKUP");
  const linehaul = leg("LINEHAUL");
  const delivery = leg("DELIVERY");
  const atHub = !!c.gateInAt || AFTER_HUB.includes(c.status);
  const delivered = DELIVERED.includes(c.status);

  const steps: Omit<LegTimelineStep, "state">[] = [];
  const done: boolean[] = [];

  steps.push({
    key: "pickup",
    label: "Pick-up",
    detail: c.selfDelivered ? "Customer brings the goods to our warehouse" : pickup?.tripId ? TERMS.pickupRun : `${TERMS.pickupRun} — not planned`,
    tripId: pickup?.tripId ?? null,
    tripRef: pickup?.tripRef ?? null,
    at: null,
  });
  done.push(c.selfDelivered ? atHub : pickup?.status === "DONE" || atHub);

  steps.push({ key: "hub", label: "At our warehouse", detail: c.gateInAt ? "Gate-in confirmed by the warehouse" : "Waiting for the gate-in", tripId: null, tripRef: null, at: c.gateInAt });
  done.push(atHub);

  if (linehaul) {
    steps.push({ key: "linehaul", label: TERMS.lineHaul, detail: linehaul.toText ? `To ${linehaul.toText}` : TERMS.lineHaul, tripId: linehaul.tripId, tripRef: linehaul.tripRef, at: null });
    done.push(linehaul.status === "DONE" || delivered || c.status === "OUT_FOR_DELIVERY");
  }

  const partner = c.lastMile === "PARTNER";
  steps.push({
    key: "delivery",
    label: "Delivery",
    detail: partner ? "Partner network" : delivery?.tripId ? TERMS.deliveryRun : `${TERMS.deliveryRun} — not planned`,
    tripId: partner ? null : (delivery?.tripId ?? null),
    tripRef: partner ? null : (delivery?.tripRef ?? null),
    at: null,
  });
  done.push(delivery?.status === "DONE" || delivered);

  const firstOpen = done.indexOf(false);
  return steps.map((s, i) => {
    let state: LegTimelineState = done[i] ? "done" : i === firstOpen ? "current" : "waiting";
    if (s.key === "pickup" && c.selfDelivered) state = done[i] ? "skipped" : state;
    return { ...s, state };
  });
}

/** The promised date as the consignment page shows it: final after the gate-in, an estimate before. */
export function promisedText(c: Pick<ConsignmentDetail, "scope" | "promisedDate" | "promisedFinal">): { text: string; estimated: boolean; note: string } {
  if (!c.promisedDate) return { text: "Agreed per order", estimated: false, note: "" };
  const estimated = c.scope === "LTL" && !c.promisedFinal;
  return { text: formatDate(c.promisedDate), estimated, note: estimated ? "Estimated until the warehouse confirms the gate-in" : "" };
}

// ── Prices of a new trip or a partner delivery ──

export interface PriceForm {
  source: "TARIFF" | "MANUAL";
  total: number | null;
  currency: "CZK" | "EUR";
  reason: string;
}

export const emptyPriceForm = (): PriceForm => ({ source: "TARIFF", total: null, currency: "CZK", reason: "" });

/** Why an agreed price cannot be sent yet (a tariff price always can). */
export function priceProblems(p: PriceForm): string[] {
  if (p.source === "TARIFF") return [];
  const out: string[] = [];
  if (p.total == null || !(p.total > 0)) out.push("Agreed price: the total");
  if (p.reason.trim().length < 3) out.push("Agreed price: why the tariff is not used");
  return out;
}

/** The price a request carries; call only when priceProblems is empty. */
export const priceInput = (p: PriceForm): { source: "TARIFF" } | { source: "MANUAL"; total: number; currency: "CZK" | "EUR"; reason: string } =>
  p.source === "TARIFF" ? { source: "TARIFF" } : { source: "MANUAL", total: p.total ?? 0, currency: p.currency, reason: p.reason.trim() };

/** A partner's sites that can be its depot: delivery sites (or both). */
export const depotSites = <T extends { kind: string }>(sites: readonly T[]) => sites.filter((s) => s.kind === "delivery" || s.kind === "both");

/** The capacity of a vehicle type from the settings; null when the type is not known. */
export function vehicleCapacity(vehicleTypes: readonly { code: string; capacityLdm: number; capacityKg: number; palletPlaces: number }[], code: string | null): Capacity | null {
  const v = code ? vehicleTypes.find((t) => t.code === code) : undefined;
  return v ? { ldm: v.capacityLdm, kg: v.capacityKg, palletPlaces: v.palletPlaces } : null;
}

/**
 * What the rate engine prices a new LTL trip with, for its haulier candidates (★ preferred lane
 * first, blocked ones apart): the legs' load together, between our warehouse and the first leg's
 * customer end (a pick-up run comes to the hub, the others leave it), buy side only.
 */
export function ltlTripRateRequest(kind: LtlTripKind, legs: readonly PlanningLeg[], hubPostcode: string, date: string): RateRequest {
  const first = legs[0];
  const sum = (pick: (l: PlanningLeg) => number) => round2(legs.reduce((s, l) => s + pick(l), 0));
  const outer = kind === "PICKUP_RUN" ? (first?.fromPostcode ?? "") : (first?.toPostcode ?? "");
  return {
    fromPostcode: kind === "PICKUP_RUN" ? outer : hubPostcode,
    toPostcode: kind === "PICKUP_RUN" ? hubPostcode : outer,
    pickupDate: date,
    pickupTime: null,
    scope: TRIP_RATE_SCOPE[kind],
    pieces: legs.length,
    palletPlaces: sum((l) => l.palletPlaces),
    ldm: sum((l) => l.ldm),
    weightKg: sum((l) => l.weightKg),
    cbm: 0,
    extras: {
      adr: legs.some((l) => l.adr),
      tailLift: legs.some((l) => l.tailLift),
      avizace: false,
      timeWindow: false,
      b2c: false,
      nonStackable: false,
      waitingHours: 0,
      declaredValueCzk: null,
    },
    customerId: null,
    serviceLevels: null,
    includeBuy: true,
    includeInternal: false,
  };
}

// ── An LTL trip's transport order ──

export interface TripOrderActions {
  printOrder: { allowed: boolean; reason: string };
  sendOrder: { allowed: boolean; reason: string };
  recordConfirmation: { allowed: boolean; reason: string };
}

const allowed = { allowed: true, reason: "" };
const refused = (reason: string) => ({ allowed: false, reason });

/** What the transport order of an LTL trip allows now (an FTL trip follows its consignment instead). */
export function ltlTripOrderActions(trip: Pick<TripDetail, "status" | "haulierStatus" | "legs" | "transportOrder">): TripOrderActions {
  if (trip.status === "CANCELLED" || trip.status === "DONE") return { printOrder: refused("The trip is closed"), sendOrder: refused("The trip is closed"), recordConfirmation: refused("The trip is closed") };
  let order = allowed;
  if (!trip.legs.length) order = refused(`No ${TERMS.leg.toLowerCase()}s on the trip`);
  else if (trip.haulierStatus === "blocked") order = refused("The haulier is blocked — see its page");
  let send = order;
  if (order.allowed && trip.status === "IN_TRANSIT") send = refused("Already on its way");
  let confirm = refused("Record the transport order as sent first");
  if (trip.status === "ORDERED") confirm = allowed;
  else if (trip.status === "CONFIRMED" || trip.status === "IN_TRANSIT") confirm = refused("Already confirmed");
  return { printOrder: order, sendOrder: send, recordConfirmation: confirm };
}
