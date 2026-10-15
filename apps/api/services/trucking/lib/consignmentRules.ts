import { APIError } from "encore.dev/api";
import { addDays, isRealYmd } from "../../../lib/businessDate";
import { isUuid } from "../../../lib/uuid";
import { normaliseCzPostcode } from "./haulierRules";
import { SERVICE_LEVEL_CODES } from "./settingsRules";
import { roundToStep } from "./rateEngine";
import type {
  ConsignmentFields,
  ConsignmentPriceInput,
  ConsignmentStatus,
  LoadInput,
  StampKind,
  StopInput,
  TripPriceInput,
  TripStatus,
} from "../interfaces/interfaces";

// Consignment and trip rules: what a consignment must look like to be saved, the status its
// stamps and trip give it, which stamp may follow which, the margin against the floor and what
// needs attention. Pure: no database, no Encore runtime besides the error type.

const bad = (message: string) => APIError.invalidArgument(message);

export const MAX_REASON = 500;
const MAX_TEXT = 300;
const MAX_NOTES = 2000;
/** A stamp may be dated back at most this many days. */
export const STAMP_BACKDATE_DAYS = 7;
/** Clock skew allowed for a stamp time sent by a browser. */
const FUTURE_SKEW_MS = 5 * 60_000;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const STAMP_KINDS: readonly StampKind[] = ["confirmed", "pickedUp", "delivered", "podReceived"];

export const STAMP_LABEL: Record<StampKind, string> = {
  confirmed: "Confirmed by the haulier",
  pickedUp: "Picked up",
  delivered: "Delivered",
  podReceived: "POD received",
};

/** Statuses from which nothing about the goods has happened yet: the consignment may still be cancelled or fully edited. */
export const BEFORE_PICKUP: readonly ConsignmentStatus[] = ["BOOKED", "PLANNED", "ORDERED", "CONFIRMED"];

// ---- text helpers --------------------------------------------------------------------------------

const text = (v: unknown, what: string, max = MAX_TEXT): string => {
  if (v !== undefined && v !== null && typeof v !== "string") throw bad(`${what} must be text`);
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length > max) throw bad(`${what} can be at most ${max} characters long`);
  return s;
};

const required = (v: unknown, what: string, max = MAX_TEXT): string => {
  const s = text(v, what, max);
  if (!s) throw bad(`${what} is required`);
  return s;
};

const number = (v: unknown, what: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw bad(`${what} must be a number, 0 or more`);
  return v;
};

/** A reason given by a manager (cancel, approval, void): 3 to 500 characters. */
export function cleanReason(v: unknown, what = "a reason"): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length < 3 || s.length > MAX_REASON) throw bad(`Give ${what} (3 to ${MAX_REASON} characters)`);
  return s;
}

const isoOrNull = (v: unknown, what: string): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) throw bad(`${what} must be a date and time`);
  return new Date(v).toISOString();
};

// ---- stops and load ------------------------------------------------------------------------------

/** A stop as stored: texts trimmed, the country in capitals, a CZ postcode as its 5 digits. */
export function cleanStop(s: StopInput, label: string): StopInput {
  if (!s || typeof s !== "object") throw bad(`The ${label} is required`);
  const country = required(s.country, `The ${label} country`, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw bad(`The ${label} country must be a two-letter code (e.g. CZ)`);
  const typedPostcode = required(s.postcode, `The ${label} postcode`, 20);
  let postcode = typedPostcode.toUpperCase().replace(/\s+/g, " ");
  if (country === "CZ") {
    const cz = normaliseCzPostcode(typedPostcode);
    if (!cz) throw bad(`The ${label} postcode must be a CZ postcode, 5 digits like 110 00`);
    postcode = cz;
  }
  const siteId = s.siteId ? String(s.siteId) : null;
  if (siteId !== null && !isUuid(siteId)) throw bad(`The ${label} site is not a valid id`);
  const windowFrom = isoOrNull(s.windowFrom, `The ${label} window start`);
  const windowTo = isoOrNull(s.windowTo, `The ${label} window end`);
  if (windowFrom && windowTo && windowFrom > windowTo) throw bad(`The ${label} window ends before it starts`);
  return {
    siteId,
    name: required(s.name, `The ${label} name`),
    street: text(s.street, `The ${label} street`),
    postcode,
    city: required(s.city, `The ${label} city`),
    country,
    windowFrom,
    windowTo,
    contactName: text(s.contactName, `The ${label} contact name`),
    contactPhone: text(s.contactPhone, `The ${label} contact phone`, 50),
    avizaceRequired: s.avizaceRequired === true,
    reference: text(s.reference, `The ${label} reference`, 100),
    notes: text(s.notes, `The ${label} notes`, MAX_NOTES),
  };
}

const PACKING_GROUPS = ["", "I", "II", "III"] as const;

/** The load as stored; ADR needs a UN number (4 digits) and a class. */
export function cleanLoad(l: LoadInput): LoadInput {
  if (!l || typeof l !== "object") throw bad("The load is required");
  const adr = l.adr === true;
  const adrUn = adr ? text(l.adrUn, "The UN number", 10).replace(/^UN\s*/i, "") : "";
  const adrClass = adr ? text(l.adrClass, "The ADR class", 10) : "";
  const adrPackingGroup = adr ? (text(l.adrPackingGroup, "The packing group", 3).toUpperCase() as LoadInput["adrPackingGroup"]) : "";
  if (adr && !/^\d{4}$/.test(adrUn)) throw bad("ADR goods need the UN number, 4 digits like 1203");
  if (adr && !adrClass) throw bad("ADR goods need the ADR class");
  if (!PACKING_GROUPS.includes(adrPackingGroup)) throw bad("The packing group must be I, II or III");
  const load: LoadInput = {
    pieces: number(l.pieces ?? 0, "Pieces"),
    palletPlaces: number(l.palletPlaces ?? 0, "Pallet places"),
    ldm: number(l.ldm ?? 0, "Loading metres"),
    weightKg: number(l.weightKg ?? 0, "The weight"),
    cbm: number(l.cbm ?? 0, "Cubic metres"),
    adr,
    adrUn,
    adrClass,
    adrPackingGroup,
    nonStackable: l.nonStackable === true,
    tailLift: l.tailLift === true,
    b2c: l.b2c === true,
    description: text(l.description, "The goods description", 500),
  };
  if (load.weightKg + load.ldm + load.cbm + load.palletPlaces <= 0) throw bad("Give the weight, loading metres, cubic metres or pallet places");
  return load;
}

/** The price a create or an update asks for; a manual price needs a total above 0, CZK or EUR, and why. */
export function cleanPrice(p: ConsignmentPriceInput | TripPriceInput, allowQuote: boolean): ConsignmentPriceInput {
  const source = p?.source;
  if (source === "TARIFF") return { source };
  if (source === "QUOTE" && allowQuote) return { source };
  if (source === "MANUAL") {
    const total = (p as { total?: unknown }).total;
    if (typeof total !== "number" || !Number.isFinite(total) || total <= 0) throw bad("The agreed price must be a number above 0");
    const currency = (p as { currency?: unknown }).currency;
    if (currency !== "CZK" && currency !== "EUR") throw bad("The currency must be CZK or EUR");
    return { source, total: roundToStep(total, 0.01), currency, reason: cleanReason((p as { reason?: unknown }).reason, "the reason for the agreed price") };
  }
  throw bad(allowQuote ? "The price source must be TARIFF, QUOTE or MANUAL" : "The price source must be TARIFF or MANUAL");
}

/** The consignment fields of a create or an update, checked and normalised; throws invalid_argument. */
export function cleanFields(f: ConsignmentFields): ConsignmentFields {
  if (typeof f.pickupDate !== "string" || !isRealYmd(f.pickupDate)) throw bad("The pick-up date must be a date like 2026-12-31");
  const pickupTime = f.pickupTime === null || f.pickupTime === undefined || f.pickupTime === "" ? null : String(f.pickupTime).trim();
  if (pickupTime !== null && !HHMM.test(pickupTime)) throw bad("The pick-up time must be a time like 14:30");
  const serviceLevel = f.serviceLevel === null || f.serviceLevel === undefined ? null : f.serviceLevel;
  if (serviceLevel !== null && !SERVICE_LEVEL_CODES.includes(serviceLevel)) throw bad("Unknown service level");
  const quoteNumber = f.quoteNumber ? text(f.quoteNumber, "The quote number", 50) || null : null;
  const price = cleanPrice(f.price, true);
  if (price.source === "TARIFF" && !serviceLevel) throw bad("Pricing from the tariff needs a service level");
  if (price.source === "QUOTE" && !quoteNumber) throw bad("Pricing from a quote needs the quote number");
  const load = cleanLoad(f.load);
  const delivery = cleanStop(f.delivery, "delivery");
  // A B2C delivery is always announced (avizace) to the consignee.
  if (load.b2c) delivery.avizaceRequired = true;
  const scope = f.scope === undefined || f.scope === null ? "FTL" : f.scope;
  if (scope !== "FTL" && scope !== "LTL") throw bad("The scope must be FTL or LTL");
  const ltl = scope === "LTL";
  const partner = ltl && f.partnerHaulierCustomerId ? String(f.partnerHaulierCustomerId) : null;
  if (partner !== null && !isUuid(partner)) throw bad("Unknown partner haulier");
  const lastMile = ltl ? (f.lastMile ?? "OWN_RUN") : null;
  if (lastMile !== null && lastMile !== "OWN_RUN" && lastMile !== "PARTNER") throw bad("The last mile must be OWN_RUN or PARTNER");
  return {
    quoteNumber,
    serviceLevel,
    pickupDate: f.pickupDate,
    pickupTime,
    pickup: cleanStop(f.pickup, "pick-up"),
    delivery,
    load,
    price,
    scope,
    selfDelivered: ltl && f.selfDelivered === true,
    lastMile,
    partnerHaulierCustomerId: lastMile === "PARTNER" ? partner : null,
  };
}

/** Plates as stored: upper case, no spaces or dashes ("1ab 2345" → "1AB2345"). */
export const normalisePlate = (v: unknown): string => {
  const s = typeof v === "string" ? v.toUpperCase().replace(/[\s-]+/g, "") : "";
  if (s.length > 15) throw bad("A plate can be at most 15 characters long");
  return s;
};

/** A Pick-up PIN as typed for printing: digits only, 4 to 8; null when none. Never stored. */
export function cleanPin(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const pin = typeof v === "string" ? v.trim() : "";
  if (!/^\d{4,8}$/.test(pin)) throw bad("The Pick-up PIN must be 4 to 8 digits");
  return pin;
}

// ---- references ----------------------------------------------------------------------------------

/** The Prague calendar year of `date`. */
export function truckingRefYear(date: Date): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric" }).format(date));
}

export const MAX_REF_NUMBER = 999_999;

/** TCZ2026000001 / LCZ2026000001 */
export const formatTruckingRef = (sequence: "TCZ" | "LCZ", year: number, n: number) => `${sequence}${year}${String(n).padStart(6, "0")}`;

// ---- status --------------------------------------------------------------------------------------

/** What the status of a consignment is worked out from. */
export interface ConsignmentFacts {
  cancelledAt: Date | null;
  tripId: string | null;
  orderSentAt: Date | null;
  confirmedAt: Date | null;
  pickedUpAt: Date | null;
  deliveredAt: Date | null;
  podReceivedAt: Date | null;
  readyToBillAt: Date | null;
}

/** The status the stamps and the trip give a consignment (the latest step reached). */
export function consignmentStatus(c: ConsignmentFacts): ConsignmentStatus {
  if (c.cancelledAt) return "CANCELLED";
  if (c.readyToBillAt) return "READY_TO_BILL";
  if (c.podReceivedAt) return "POD_RECEIVED";
  if (c.deliveredAt) return "DELIVERED";
  if (c.pickedUpAt) return "PICKED_UP";
  if (c.confirmedAt) return "CONFIRMED";
  if (c.tripId && c.orderSentAt) return "ORDERED";
  if (c.tripId) return "PLANNED";
  return "BOOKED";
}

/** The status of an FTL trip from its own state and its one consignment. */
export function tripStatus(t: { cancelledAt: Date | null; orderSentAt: Date | null; confirmedAt: Date | null }, c: Pick<ConsignmentFacts, "pickedUpAt" | "deliveredAt"> | null): TripStatus {
  if (t.cancelledAt) return "CANCELLED";
  if (c?.deliveredAt) return "DONE";
  if (c?.pickedUpAt) return "IN_TRANSIT";
  if (t.confirmedAt) return "CONFIRMED";
  if (t.orderSentAt) return "ORDERED";
  return "DRAFT";
}

/** Why a stamp may not be set now (in this order of the lifecycle), or null when it may. */
export function stampRefusal(kind: StampKind, c: ConsignmentFacts, opts: { hasPod: boolean; manager: boolean }): string | null {
  if (c.cancelledAt) return "The consignment is cancelled";
  switch (kind) {
    case "confirmed":
      return c.tripId && c.orderSentAt ? null : "Send the transport order first";
    case "pickedUp":
      return c.tripId && c.orderSentAt ? null : "Send the transport order before stamping the pick-up";
    case "delivered":
      return c.pickedUpAt ? null : "Stamp the pick-up first";
    case "podReceived":
      if (!c.deliveredAt) return "Stamp the delivery first";
      if (!opts.hasPod && !opts.manager) return "Upload the POD first (a manager may stamp it without one)";
      return null;
  }
}

/** Why a stamp may not be voided (a later stamp stands on it), or null. */
export function voidRefusal(kind: StampKind, c: ConsignmentFacts): string | null {
  const after: Record<StampKind, Date | null> = {
    confirmed: c.pickedUpAt,
    pickedUp: c.deliveredAt,
    delivered: c.podReceivedAt,
    podReceived: null,
  };
  return after[kind] ? "Void the later stamp first" : null;
}

/** The time a stamp is recorded at: now, or a past time within STAMP_BACKDATE_DAYS (not in the future). */
export function stampTime(at: string | null | undefined, now: Date): Date {
  if (at === null || at === undefined || at === "") return now;
  const t = Date.parse(at);
  if (Number.isNaN(t)) throw bad("The stamp time must be a date and time");
  if (t > now.getTime() + FUTURE_SKEW_MS) throw bad("The stamp time cannot be in the future");
  if (t < now.getTime() - STAMP_BACKDATE_DAYS * 86_400_000) throw bad(`The stamp time can be at most ${STAMP_BACKDATE_DAYS} days back`);
  return new Date(t);
}

// ---- margin --------------------------------------------------------------------------------------

export interface MarginFacts {
  marginCzk: number | null;
  marginPercent: number | null;
  belowFloor: boolean;
}

/** Margin of the sell over the buy price, against the floor; nothing to judge without both. */
export function marginOf(sellCzk: number | null, buyCzk: number | null, floor: { percent: number; minAmountCzk: number }): MarginFacts {
  if (sellCzk === null || buyCzk === null) return { marginCzk: null, marginPercent: null, belowFloor: false };
  const marginCzk = roundToStep(sellCzk - buyCzk, 0.01);
  const marginPercent = sellCzk > 0 ? roundToStep((marginCzk / sellCzk) * 100, 0.01) : null;
  const belowFloor = (marginPercent !== null && marginPercent < floor.percent) || marginCzk < floor.minAmountCzk;
  return { marginCzk, marginPercent, belowFloor };
}

/** An approval covers the margin as it is now when the margin is not worse than the one approved. */
export function approvalCovers(approval: { marginCzk: number | null } | null, marginCzk: number | null): boolean {
  if (!approval) return false;
  if (approval.marginCzk === null || marginCzk === null) return true;
  return marginCzk >= approval.marginCzk - 0.005;
}

// ---- attention -----------------------------------------------------------------------------------

/** What the worklist needs to know of a consignment. */
export interface AttentionFacts extends ConsignmentFacts {
  status: ConsignmentStatus;
  pickupDate: string;
  promisedDate: string | null;
  belowFloor: boolean;
  marginApproved: boolean;
  marginCzk: number | null;
  tripRejectedAt: Date | null;
}

/** Days after the delivery when a missing POD needs attention. */
export const POD_OVERDUE_DAYS = 2;

/** Plain-English reasons the consignment needs someone now ([] when none). `today` is the Prague day. */
export function attentionReasons(c: AttentionFacts, today: string, now: Date): string[] {
  if (c.cancelledAt) return [];
  const reasons: string[] = [];
  const soon = c.pickupDate <= addDays(today, 1);
  if (c.status === "BOOKED" && soon) reasons.push("Pick-up within 24 h and no trip");
  if (c.status === "PLANNED" && soon) reasons.push("Pick-up within 24 h and the transport order is not sent");
  if (c.tripRejectedAt && !c.confirmedAt) reasons.push("The haulier rejected the transport order");
  if (c.belowFloor && !c.marginApproved) reasons.push("Margin below the floor: needs a manager's approval");
  if (c.marginCzk !== null && c.marginCzk < 0) reasons.push("Negative margin");
  if ((c.status === "ORDERED" || c.status === "CONFIRMED") && c.pickupDate < today) reasons.push("Pick-up date passed and no pick-up stamped");
  if (c.deliveredAt && !c.podReceivedAt && now.getTime() - c.deliveredAt.getTime() > POD_OVERDUE_DAYS * 86_400_000) {
    reasons.push(`POD missing for more than ${POD_OVERDUE_DAYS} days`);
  }
  return reasons;
}

// ---- transport order -------------------------------------------------------------------------------

/**
 * Why a transport order may not be printed or sent now, or null: the consignment or trip is
 * cancelled, the margin is below the floor without a manager's approval, or the haulier is
 * blocked (its block issues named).
 */
export function transportOrderRefusal(o: {
  consignmentCancelled: boolean;
  tripCancelled: boolean;
  belowFloor: boolean;
  marginApproved: boolean;
  haulierName: string;
  haulierBlockIssues: string[];
}): string | null {
  if (o.consignmentCancelled) return "The consignment is cancelled";
  if (o.tripCancelled) return "The trip is cancelled";
  if (o.belowFloor && !o.marginApproved) return "The margin is below the floor: a manager must approve it before the transport order goes out";
  if (o.haulierBlockIssues.length) return `${o.haulierName} cannot be used: ${o.haulierBlockIssues.join("; ")}`;
  return null;
}

/** The transport-order e-mail text with {orderRef}, {haulier} and {date} filled in. */
export const fillOrderText = (template: string, v: { orderRef: string; haulier: string; date: string }) =>
  template.replace(/\{orderRef\}/g, v.orderRef).replace(/\{haulier\}/g, v.haulier).replace(/\{date\}/g, v.date);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Recipients of a transport order: valid addresses, at most 10. */
export function cleanRecipients(to: unknown): string[] {
  const list = Array.isArray(to) ? to.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean) : [];
  if (list.length > 10) throw bad("At most 10 recipients");
  const wrong = list.find((a) => !EMAIL.test(a));
  if (wrong) throw bad(`"${wrong}" is not an e-mail address`);
  return [...new Set(list)];
}
