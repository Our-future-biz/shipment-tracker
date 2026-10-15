import { APIError } from "encore.dev/api";
import { addDays } from "../../../lib/businessDate";
import { addWorkingDays, effectiveStartDate } from "../../../lib/workingDays";
import { isUuid } from "../../../lib/uuid";
import { normaliseCzPostcode } from "./haulierRules";
import { fmt, promise, roundToStep, showPostcode } from "./rateEngine";
import { formatDay } from "./format";
import type {
  ConsignmentStatus,
  Deadline,
  HubAddress,
  LastMile,
  LegKind,
  LegStatus,
  LtlTripKind,
  ServiceLevelSetting,
  StampKind,
  StopInput,
  TripCapacity,
  TripFill,
  TripStatus,
  VehicleTypeSetting,
} from "../interfaces/interfaces";

// LTL groupage rules: our warehouse (the hub), which legs a consignment needs, the status its
// legs and the warehouse's gate give it, the promised date (an estimate until the gate-in is
// confirmed), deadlines on the planning board, and a trip's fill and warnings. Pure: no database,
// no Encore runtime besides the error type. Warnings never block (the Warehouse rule).

const bad = (message: string) => APIError.invalidArgument(message);

// ---- our warehouse -------------------------------------------------------------------------------

export const EMPTY_HUB: HubAddress = { name: "", street: "", postcode: "", city: "", country: "CZ" };
export const HUB_MISSING = "Set the warehouse address in Trucking settings";

export const hubIsSet = (h: HubAddress): boolean => !!(h.name && h.postcode && h.city);

/** "Sklad Praha, 250 01 Brandýs" */
export const hubText = (h: HubAddress): string => `${h.name}, ${showPostcode(h.postcode)} ${h.city}`;

/** The hub as saved: all empty (not set), or a name, a CZ postcode and a city (street optional). */
export function cleanHub(h: HubAddress | null | undefined): HubAddress {
  if (!h || typeof h !== "object") return EMPTY_HUB;
  const text = (v: unknown, what: string, max: number) => {
    const s = typeof v === "string" ? v.trim() : "";
    if (s.length > max) throw bad(`${what} can be at most ${max} characters long`);
    return s;
  };
  const name = text(h.name, "The warehouse name", 120);
  const street = text(h.street, "The warehouse street", 200);
  const city = text(h.city, "The warehouse city", 100);
  const typed = text(h.postcode, "The warehouse postcode", 10);
  if (!name && !street && !city && !typed) return EMPTY_HUB;
  if (h.country !== undefined && h.country !== "CZ") throw bad("Our warehouse must be in CZ");
  if (!name || !city || !typed) throw bad("Give the warehouse name, postcode and city (or leave them all empty)");
  const postcode = normaliseCzPostcode(typed);
  if (!postcode) throw bad("The warehouse postcode must be a CZ postcode, 5 digits like 250 01");
  return { name, street, postcode, city, country: "CZ" };
}

// ---- legs ----------------------------------------------------------------------------------------

/** Legs are numbered by their kind, so a consignment's legs are always in road order. */
export const LEG_SEQ: Record<LegKind, number> = { PICKUP: 1, LINEHAUL: 2, DELIVERY: 3 };

/** The leg kind each LTL trip kind carries. */
export const LEG_OF_TRIP: Record<LtlTripKind, LegKind> = { PICKUP_RUN: "PICKUP", LINEHAUL: "LINEHAUL", DELIVERY_RUN: "DELIVERY" };

export const LTL_TRIP_KINDS: readonly LtlTripKind[] = ["PICKUP_RUN", "LINEHAUL", "DELIVERY_RUN"];

export const TRIP_KIND_LABEL: Record<LtlTripKind, { cs: string; en: string }> = {
  PICKUP_RUN: { cs: "Svozová trasa", en: "Pick-up run" },
  LINEHAUL: { cs: "Linková přeprava", en: "Line haul" },
  DELIVERY_RUN: { cs: "Rozvozová trasa", en: "Delivery run" },
};

export const isLtlTripKind = (v: unknown): v is LtlTripKind => LTL_TRIP_KINDS.includes(v as LtlTripKind);

/** What an LTL consignment chose: brought by the customer or picked up, and who delivers the last mile. */
export interface LtlChoice {
  selfDelivered: boolean;
  lastMile: LastMile;
  partnerHaulierCustomerId: string | null;
}

export function cleanLtlChoice(f: { selfDelivered?: unknown; lastMile?: unknown; partnerHaulierCustomerId?: unknown }): LtlChoice {
  const lastMile = f.lastMile === undefined || f.lastMile === null ? "OWN_RUN" : f.lastMile;
  if (lastMile !== "OWN_RUN" && lastMile !== "PARTNER") throw bad("The last mile must be OWN_RUN or PARTNER");
  const partner = f.partnerHaulierCustomerId ? String(f.partnerHaulierCustomerId) : null;
  if (partner !== null && !isUuid(partner)) throw bad("Unknown partner haulier");
  return { selfDelivered: f.selfDelivered === true, lastMile, partnerHaulierCustomerId: lastMile === "PARTNER" ? partner : null };
}

/**
 * The legs an LTL consignment needs: a pick-up unless the customer brings the goods, a line haul
 * when a partner delivers from a depot that is not our warehouse, and the delivery.
 */
export function legKindsFor(c: { selfDelivered: boolean; lastMile: LastMile | null }, depotIsHub: boolean): LegKind[] {
  const kinds: LegKind[] = [];
  if (!c.selfDelivered) kinds.push("PICKUP");
  if (c.lastMile === "PARTNER" && !depotIsHub) kinds.push("LINEHAUL");
  kinds.push("DELIVERY");
  return kinds;
}

/** Whether a leg goes on one of our trips (a partner's delivery does not). */
export const legNeedsTrip = (kind: LegKind, lastMile: LastMile | null): boolean => kind !== "DELIVERY" || lastMile !== "PARTNER";

/** One end of a leg: what is printed and the postcode it is rated with. */
export interface Place {
  text: string;
  postcode: string;
}

/** "Alfa s.r.o., 110 00 Praha" */
export const stopPlace = (s: StopInput): Place => ({ text: `${s.name}, ${s.country === "CZ" ? showPostcode(s.postcode) : s.postcode} ${s.city}`, postcode: s.postcode });

export const hubPlace = (h: HubAddress): Place => (hubIsSet(h) ? { text: hubText(h), postcode: h.postcode } : { text: "Our warehouse", postcode: "" });

/** Where a leg starts and ends: pick-up → our warehouse → (partner's depot) → consignee. */
export function legEnds(kind: LegKind, c: { pickup: StopInput; delivery: StopInput }, hub: Place, depot: Place | null): { from: Place; to: Place } {
  switch (kind) {
    case "PICKUP":
      return { from: stopPlace(c.pickup), to: hub };
    case "LINEHAUL":
      return { from: hub, to: depot ?? hub };
    case "DELIVERY":
      return { from: depot ?? hub, to: stopPlace(c.delivery) };
  }
}

// ---- status --------------------------------------------------------------------------------------

/** What an LTL consignment's status is worked out from. */
export interface LtlFacts {
  cancelledAt: Date | null;
  pickedUpAt: Date | null;
  gateInAt: Date | null;
  gateOutAt: Date | null;
  deliveredAt: Date | null;
  podReceivedAt: Date | null;
  readyToBillAt: Date | null;
  /** In road order; orderSent = the leg's trip has its transport order sent */
  legs: { kind: LegKind; status: LegStatus; orderSent: boolean }[];
}

/**
 * BOOKED → PLANNED (every leg planned) → ORDERED (the first leg's transport order sent) →
 * PICKED_UP → AT_HUB (gate-in) → ON_LINEHAUL / OUT_FOR_DELIVERY (gate-out, by the next leg) →
 * DELIVERED → POD_RECEIVED → READY_TO_BILL; CANCELLED. The latest step reached wins.
 */
export function ltlStatus(f: LtlFacts): ConsignmentStatus {
  if (f.cancelledAt) return "CANCELLED";
  if (f.readyToBillAt) return "READY_TO_BILL";
  if (f.podReceivedAt) return "POD_RECEIVED";
  if (f.deliveredAt) return "DELIVERED";
  if (f.gateOutAt) return f.legs.some((l) => l.kind === "LINEHAUL") ? "ON_LINEHAUL" : "OUT_FOR_DELIVERY";
  if (f.gateInAt) return "AT_HUB";
  if (f.pickedUpAt) return "PICKED_UP";
  if (f.legs[0]?.orderSent) return "ORDERED";
  if (f.legs.length && f.legs.every((l) => l.status !== "OPEN")) return "PLANNED";
  return "BOOKED";
}

/**
 * Why a consignment stamp may not be set on an LTL consignment now, or null. The haulier confirms
 * the trip, not the consignment; the pick-up follows the pick-up run's transport order (none
 * when the customer brings the goods); the delivery follows the confirmed gate-in.
 */
export function ltlStampRefusal(
  kind: StampKind,
  c: { cancelledAt: Date | null; selfDelivered: boolean; gateInAt: Date | null; deliveredAt: Date | null },
  legs: { kind: LegKind; orderSent: boolean }[],
  opts: { hasPod: boolean; manager: boolean },
): string | null {
  if (c.cancelledAt) return "The consignment is cancelled";
  switch (kind) {
    case "confirmed":
      return "A groupage consignment is confirmed with its trip: record the confirmation on the trip's transport order";
    case "pickedUp":
      if (c.selfDelivered) return "The customer brings the goods to our warehouse: there is no pick-up";
      return legs.find((l) => l.kind === "PICKUP")?.orderSent ? null : "Send the pick-up run's transport order before stamping the pick-up";
    case "delivered":
      return c.gateInAt ? null : "The goods have not passed our warehouse yet (no gate-in from the warehouse)";
    case "podReceived":
      if (!c.deliveredAt) return "Stamp the delivery first";
      if (!opts.hasPod && !opts.manager) return "Upload the POD first (a manager may stamp it without one)";
      return null;
  }
}

/** An LTL trip: DRAFT → ORDERED → CONFIRMED → IN_TRANSIT (departed) → DONE (arrived); CANCELLED. */
export function ltlTripStatus(t: { cancelledAt: Date | null; orderSentAt: Date | null; confirmedAt: Date | null; departedAt: Date | null; arrivedAt: Date | null }): TripStatus {
  if (t.cancelledAt) return "CANCELLED";
  if (t.arrivedAt) return "DONE";
  if (t.departedAt) return "IN_TRANSIT";
  if (t.confirmedAt) return "CONFIRMED";
  if (t.orderSentAt) return "ORDERED";
  return "DRAFT";
}

/** Legs may still be added or removed: the truck has not left. */
export const tripOpenForLegs = (s: TripStatus) => s === "DRAFT" || s === "ORDERED" || s === "CONFIRMED";

// ---- promised date --------------------------------------------------------------------------------

export const ESTIMATE_NOTE = "Estimated until the warehouse confirms the gate-in";

/**
 * The promised delivery of an LTL consignment. Before the gate-in it is an estimate: the planned
 * pick-up day taken as the gate-in day. After it, D+N working days from the confirmed gate-in
 * (after the level's cut-off: from the next working day) - final. Null when the level gives no
 * date (none, or a date agreed per order): the stored date then stays.
 */
export function ltlPromise(
  level: ServiceLevelSetting | null,
  gateInAt: Date | null,
  estimateDay: string,
  extraHolidays: readonly string[],
): { promisedDate: string | null; final: boolean } | null {
  if (!level || level.code === "EXP_FIXED") return null;
  if (!gateInAt) return { promisedDate: promise(level, estimateDay, null, "LTL", extraHolidays).promisedDate, final: false };
  const start = effectiveStartDate(gateInAt, level.cutoff, extraHolidays);
  return { promisedDate: addWorkingDays(start, level.workingDays, extraHolidays), final: true };
}

// ---- planning board ------------------------------------------------------------------------------

/** The day a leg must run by: the pick-up date for a pick-up, else the promised delivery date. */
export const neededBy = (kind: LegKind, c: { pickupDate: string; promisedDate: string | null }): string =>
  kind === "PICKUP" ? c.pickupDate : (c.promisedDate ?? c.pickupDate);

export function deadlineOf(needed: string, today: string): Deadline {
  if (needed < today) return "overdue";
  if (needed === today) return "today";
  if (needed === addDays(today, 1)) return "tomorrow";
  return "later";
}

// ---- fill and warnings ---------------------------------------------------------------------------

export function capacityOf(v: VehicleTypeSetting | null): TripCapacity | null {
  if (!v) return null;
  return { vehicleTypeCode: v.code, label: v.label, ldm: v.capacityLdm, kg: v.capacityKg, palletPlaces: v.palletPlaces, tailLift: v.tailLift };
}

const percent = (used: number, cap: number) => (cap > 0 ? roundToStep((used / cap) * 100, 0.1) : null);

/** What the legs fill of the vehicle. */
export function tripFill(loads: { ldm: number; weightKg: number; palletPlaces: number }[], cap: TripCapacity | null): TripFill {
  const ldm = roundToStep(loads.reduce((a, l) => a + l.ldm, 0), 0.01);
  const kg = roundToStep(loads.reduce((a, l) => a + l.weightKg, 0), 0.01);
  const palletPlaces = roundToStep(loads.reduce((a, l) => a + l.palletPlaces, 0), 0.01);
  return { ldm, kg, palletPlaces, ldmPercent: cap ? percent(ldm, cap.ldm) : null, kgPercent: cap ? percent(kg, cap.kg) : null };
}

/** Working days a trip of the kind needs before the goods can be at the consignee. */
export const TRANSIT_DAYS: Record<LtlTripKind, number> = { PICKUP_RUN: 1, LINEHAUL: 1, DELIVERY_RUN: 0 };

export interface WarningLeg {
  consignmentRef: string;
  adr: boolean;
  tailLift: boolean;
  promisedDate: string | null;
}

/** Plain-English warnings of a trip (they never block). */
export function tripWarnings(o: {
  kind: LtlTripKind;
  date: string;
  capacity: TripCapacity | null;
  fill: TripFill;
  haulierName: string;
  haulierAdrCapable: boolean;
  legs: WarningLeg[];
  extraHolidays?: readonly string[];
}): string[] {
  const out: string[] = [];
  const cap = o.capacity;
  if (cap) {
    if (o.fill.ldm > cap.ldm) out.push(`Over capacity: ${fmt(o.fill.ldm)} of ${fmt(cap.ldm)} LDM`);
    if (o.fill.kg > cap.kg) out.push(`Over capacity: ${fmt(o.fill.kg)} of ${fmt(cap.kg)} kg`);
    if (cap.palletPlaces > 0 && o.fill.palletPlaces > cap.palletPlaces) out.push(`Over capacity: ${fmt(o.fill.palletPlaces)} of ${fmt(cap.palletPlaces)} pallet places`);
  }
  const earliest = addWorkingDays(o.date, TRANSIT_DAYS[o.kind], o.extraHolidays ?? []);
  for (const l of o.legs) {
    if (l.adr && !o.haulierAdrCapable) out.push(`${l.consignmentRef} is ADR goods and ${o.haulierName} is not ADR-capable`);
    if (l.promisedDate && l.promisedDate < earliest) out.push(`${l.consignmentRef} is promised for ${formatDay(l.promisedDate)}, before this trip can get it there (${formatDay(earliest)})`);
    if (l.tailLift && cap && !cap.tailLift) out.push(`${l.consignmentRef} needs a tail lift and the ${cap.label} has none`);
  }
  return out;
}

/** Stop order after a change: the old order kept, removed legs dropped, new legs at the end; a given order wins when it names exactly the legs. */
export function nextStopOrder(current: string[], legIds: string[], asked: string[] | null): string[] {
  if (asked) {
    const same = asked.length === legIds.length && new Set(asked).size === asked.length && asked.every((id) => legIds.includes(id));
    if (!same) throw bad("The stop order must list every leg of the trip once");
    return asked;
  }
  const kept = current.filter((id) => legIds.includes(id));
  return [...kept, ...legIds.filter((id) => !kept.includes(id))];
}

// ---- the warehouse's gate --------------------------------------------------------------------------

export interface GateFacts {
  selfDelivered: boolean;
  gateInAt: Date | null;
  gateOutAt: Date | null;
  deliveredAt: Date | null;
  /** The pick-up leg exists and is not done */
  pickupOpen: boolean;
}

const stampOf = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/**
 * What a gate event changes on one LTL consignment of the job, or null when nothing:
 * gate-in → the gate-in time (a consignment brought by the customer, or with its pick-up still
 * open); gate-out → the gate-out time (after the gate-in, before the delivery); voided → the
 * voided stamp is taken back (the later step first).
 */
export function gateChange(kind: "gateIn" | "gateOut" | "voided", stampKind: string, at: Date, c: GateFacts): { gateInAt?: Date | null; gateOutAt?: Date | null } | null {
  if (kind === "gateIn") return !c.gateInAt && (c.selfDelivered || c.pickupOpen) ? { gateInAt: at } : null;
  if (kind === "gateOut") return c.gateInAt && !c.gateOutAt && !c.deliveredAt ? { gateOutAt: at } : null;
  const voided = stampOf(stampKind);
  if (voided === "gateout") return c.gateOutAt && !c.deliveredAt ? { gateOutAt: null } : null;
  if (voided === "gatein") return c.gateInAt && !c.gateOutAt && !c.deliveredAt ? { gateInAt: null } : null;
  return null;
}
