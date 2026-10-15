import { APIError } from "encore.dev/api";
import { businessDay } from "../../../lib/businessDate";
import { addWorkingDays } from "../../../lib/workingDays";
import { isUuid } from "../../../lib/uuid";
import type { TariffSurcharge, TariffScope, WaitingFreeTime } from "../interfaces/interfaces";
import type {
  AvizaceChannel,
  AvizaceRecord,
  AvizaceTemplate,
  DeliveryException,
  ExceptionCause,
  ExceptionDecision,
  ExceptionKind,
  FailedReason,
} from "../interfaces/avizace.interfaces";
import type { TruckingConsignmentRecord } from "../schemas/truckingConsignment.schema";
import type { TruckingExceptionRecord } from "../schemas/avizace.schema";
import { cleanReason } from "./consignmentRules";
import { formatDate, formatNumber } from "./docFormat";
import { roundToStep } from "./rateEngine";

// Phase 6 part A rules: when a delivery needs an avizace and the text prepared for it, what a
// recorded avizace and a delivery exception must look like, what a decision needs, the waiting
// charge from the tariff and when a POD is missing. Pure: no database, no Encore runtime besides
// the error type.

const bad = (message: string) => APIError.invalidArgument(message);
const MAX_TEXT = 200;
const MAX_NOTE = 2000;

const text = (v: unknown, what: string, max: number): string => {
  if (v !== undefined && v !== null && typeof v !== "string") throw bad(`${what} must be text`);
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length > max) throw bad(`${what} can be at most ${max} characters long`);
  return s;
};

const isoOrNull = (v: unknown, what: string): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) throw bad(`${what} must be a date and time`);
  return new Date(v).toISOString();
};

// ---- avizace -----------------------------------------------------------------------------------

/** A B2C delivery, or a delivery stop marked so, is announced to the consignee before it goes. */
export const avizaceNeeded = (c: Pick<TruckingConsignmentRecord, "delivery" | "load">): boolean => c.delivery.avizaceRequired || c.load.b2c;

/** Still to be done: needed, none recorded, the consignment live and not delivered yet. */
export const avizacePending = (c: Pick<TruckingConsignmentRecord, "delivery" | "load" | "avizace" | "cancelledAt" | "deliveredAt">): boolean =>
  avizaceNeeded(c) && !c.avizace && !c.cancelledAt && !c.deliveredAt;

export const AVIZACE_CHANNELS: readonly AvizaceChannel[] = ["PHONE", "EMAIL", "SMS", "OTHER"];

export interface AvizaceInput {
  channel: AvizaceChannel;
  contact: string;
  agreedFrom: string | null;
  agreedTo: string | null;
  note: string;
}

/** A recorded avizace as stored: the channel, who was told, the window agreed (if any) and a note. */
export function cleanAvizace(input: AvizaceInput, at: Date, by: string): AvizaceRecord {
  if (!AVIZACE_CHANNELS.includes(input?.channel)) throw bad("The channel must be PHONE, EMAIL, SMS or OTHER");
  const contact = text(input.contact, "The contact", MAX_TEXT);
  if (!contact) throw bad("Say who was told (the contact)");
  const agreedFrom = isoOrNull(input.agreedFrom, "The agreed window start");
  const agreedTo = isoOrNull(input.agreedTo, "The agreed window end");
  if (agreedFrom && agreedTo && agreedFrom > agreedTo) throw bad("The agreed window ends before it starts");
  return { at: at.toISOString(), by, channel: input.channel, contact, agreedFrom, agreedTo, note: text(input.note, "The note", MAX_NOTE) };
}

const pragueTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

/**
 * The avizace text to copy, in Czech and English: the consignee and address, the day and window
 * (the stop's window, else the promised date), the consignment ref, pieces / pallets / kg and the
 * tail lift / B2C notes. Never the Pick-up PIN (it is not stored, and is not for the consignee).
 */
export function avizaceTemplate(c: Pick<TruckingConsignmentRecord, "ref" | "delivery" | "load" | "promisedDate">): AvizaceTemplate {
  const d = c.delivery;
  const l = c.load;
  const address = [d.street, `${d.postcode} ${d.city}`.trim()].filter(Boolean).join(", ");
  const day = d.windowFrom ?? d.windowTo ?? c.promisedDate;
  const window = d.windowFrom && d.windowTo ? `${pragueTime(d.windowFrom)}–${pragueTime(d.windowTo)}` : d.windowFrom ? `${pragueTime(d.windowFrom)}` : "";
  const when = (lang: "cs" | "en") => {
    if (!day) return lang === "cs" ? "bude upřesněn" : "to be agreed";
    const date = formatDate(day, lang);
    return window ? `${date}, ${window}` : date;
  };
  const goods = (lang: "cs" | "en") =>
    lang === "cs"
      ? `${formatNumber(l.pieces, "cs", 0)} ks, ${formatNumber(l.palletPlaces, "cs")} pal. míst, ${formatNumber(l.weightKg, "cs", 1)} kg`
      : `${formatNumber(l.pieces, "en", 0)} pcs, ${formatNumber(l.palletPlaces, "en")} pallet places, ${formatNumber(l.weightKg, "en", 1)} kg`;
  const cs = [
    "Dobrý den,",
    "",
    `oznamujeme doručení zásilky ${c.ref} pro ${d.name}, ${address}.`,
    `Termín doručení: ${when("cs")}.`,
    `Zboží: ${goods("cs")}.`,
    ...(l.tailLift ? ["Vykládka hydraulickým čelem."] : []),
    ...(l.b2c ? ["Doručení na soukromou adresu: prosíme, buďte v uvedeném termínu přítomni."] : []),
    "",
    "Prosíme o potvrzení termínu. Děkujeme.",
  ].join("\n");
  const en = [
    "Hello,",
    "",
    `we would like to announce the delivery of consignment ${c.ref} to ${d.name}, ${address}.`,
    `Delivery: ${when("en")}.`,
    `Goods: ${goods("en")}.`,
    ...(l.tailLift ? ["Unloading with a tail lift."] : []),
    ...(l.b2c ? ["Delivery to a private address: please be there at the time given."] : []),
    "",
    "Please confirm the date. Thank you.",
  ].join("\n");
  return { cs, en, subject: `Avizace doručení / Delivery notice ${c.ref}`, to: d.contactPhone };
}

/** The warning a delivery run / FTL trip shows while one of its deliveries needs an avizace not recorded (never blocks). */
export function avizaceWarnings(consignments: Pick<TruckingConsignmentRecord, "ref" | "delivery" | "load" | "avizace" | "cancelledAt" | "deliveredAt">[]): string[] {
  return consignments.filter(avizacePending).map((c) => `${c.ref}: avizace needed and not recorded yet`);
}

// ---- POD missing ---------------------------------------------------------------------------------

/** Working days after the delivery when a missing POD shows in "POD missing". */
export const POD_MISSING_WORKING_DAYS = 2;

/** Delivered more than 2 working days before `today` (Prague) and no POD. */
export function podMissing(c: Pick<TruckingConsignmentRecord, "deliveredAt" | "podReceivedAt" | "cancelledAt">, today: string, extraHolidays: readonly string[] = []): boolean {
  if (!c.deliveredAt || c.podReceivedAt || c.cancelledAt) return false;
  return addWorkingDays(businessDay(c.deliveredAt), POD_MISSING_WORKING_DAYS, extraHolidays) < today;
}

// ---- delivery exceptions -------------------------------------------------------------------------

export const EXCEPTION_KINDS: readonly ExceptionKind[] = ["FAILED_DELIVERY", "DAMAGE", "SHORTAGE", "OVERAGE", "WAITING_TIME", "REDELIVERY", "OTHER"];
export const FAILED_REASONS: readonly FailedReason[] = ["CLOSED", "ABSENT", "REFUSED", "WRONG_ADDRESS", "REFUSED_DAMAGED", "NO_AVIZACE", "OTHER"];
export const EXCEPTION_CAUSES: readonly ExceptionCause[] = ["CUSTOMER", "HAULIER", "US", "UNKNOWN"];
export const DECISIONS: readonly ExceptionDecision[] = ["CHARGE_CUSTOMER", "CLAIM_HAULIER", "ABSORB"];

export const EXCEPTION_LABEL: Record<ExceptionKind, string> = {
  FAILED_DELIVERY: "Failed delivery",
  DAMAGE: "Damage",
  SHORTAGE: "Shortage",
  OVERAGE: "Overage",
  WAITING_TIME: "Waiting time",
  REDELIVERY: "Redelivery",
  OTHER: "Other",
};

export interface ExceptionInput {
  kind: ExceptionKind;
  failedReason: FailedReason | null;
  cause: ExceptionCause | null;
  description: string;
  pieces: number | null;
  waitingMinutes: number | null;
  amount: number | null;
  currency: "CZK" | "EUR" | null;
  legId: string | null;
}

const wholeOrNull = (v: unknown, what: string, min: number): number | null => {
  if (v === null || v === undefined) return null;
  if (!Number.isInteger(v) || (v as number) < min) throw bad(`${what} must be a whole number of at least ${min}`);
  return v as number;
};

/** An amount: null, or a number of at least 0 rounded to cents. */
export function cleanAmount(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v >= 1e10) throw bad("The amount must be a number, 0 or more");
  return roundToStep(v, 0.01);
}

export const cleanCurrency = (v: unknown): "CZK" | "EUR" => {
  if (v === null || v === undefined || v === "") return "CZK";
  if (v !== "CZK" && v !== "EUR") throw bad("The currency must be CZK or EUR");
  return v;
};

/** A new exception as stored; throws invalid_argument with what is missing. */
export function cleanException(input: ExceptionInput) {
  const kind = input?.kind;
  if (!EXCEPTION_KINDS.includes(kind)) throw bad(`The kind must be one of ${EXCEPTION_KINDS.join(", ")}`);
  let failedReason: FailedReason | null = null;
  if (kind === "FAILED_DELIVERY") {
    if (!FAILED_REASONS.includes(input.failedReason as FailedReason)) throw bad("A failed delivery needs the reason");
    failedReason = input.failedReason;
  }
  const cause = input.cause ?? "UNKNOWN";
  if (!EXCEPTION_CAUSES.includes(cause)) throw bad("The cause must be CUSTOMER, HAULIER, US or UNKNOWN");
  const description = text(input.description, "The description", MAX_NOTE);
  if (!description && (kind === "OTHER" || failedReason === "OTHER")) throw bad("Describe what happened");
  const pieces = wholeOrNull(input.pieces, "Pieces", 1);
  if ((kind === "DAMAGE" || kind === "SHORTAGE" || kind === "OVERAGE") && pieces === null) throw bad(`Give the pieces ${kind === "DAMAGE" ? "damaged" : kind === "SHORTAGE" ? "missing" : "over"}`);
  const waitingMinutes = kind === "WAITING_TIME" ? wholeOrNull(input.waitingMinutes, "The waiting minutes", 1) : null;
  if (kind === "WAITING_TIME" && waitingMinutes === null) throw bad("Give how many minutes the truck waited");
  if (input.legId !== null && input.legId !== undefined && (typeof input.legId !== "string" || !isUuid(input.legId))) throw bad("Unknown leg");
  return {
    kind,
    failedReason,
    cause,
    description,
    pieces,
    waitingMinutes,
    amount: cleanAmount(input.amount),
    currency: cleanCurrency(input.currency),
    legId: input.legId ?? null,
  };
}

export interface DecisionInput {
  decision: ExceptionDecision;
  cause: ExceptionCause | null;
  amount: number | null;
  currency: "CZK" | "EUR" | null;
  reason: string;
}

/**
 * A decision as stored. Charging the customer or claiming from the haulier needs an amount above 0
 * and a manager; so does absorbing an amount above 0. Throws invalid_argument / permission_denied.
 */
export function cleanDecision(input: DecisionInput, current: { amount: number | null; currency: "CZK" | "EUR"; cause: ExceptionCause }, manager: boolean) {
  const decision = input?.decision;
  if (!DECISIONS.includes(decision)) throw bad("The decision must be CHARGE_CUSTOMER, CLAIM_HAULIER or ABSORB");
  const cause = input.cause ?? current.cause;
  if (!EXCEPTION_CAUSES.includes(cause)) throw bad("The cause must be CUSTOMER, HAULIER, US or UNKNOWN");
  const amount = cleanAmount(input.amount) ?? current.amount;
  const currency = input.currency ? cleanCurrency(input.currency) : current.currency;
  if ((decision === "CHARGE_CUSTOMER" || decision === "CLAIM_HAULIER") && !(amount && amount > 0)) throw bad("Give the amount (above 0)");
  if (!manager && (decision !== "ABSORB" || (amount ?? 0) > 0)) {
    throw APIError.permissionDenied("Only a manager can charge the customer, claim from the haulier or absorb a cost");
  }
  return { decision, cause, amount, currency, reason: cleanReason(input.reason, "a reason for the decision") };
}

/** The waiting text of a charge line: "Waiting time 45 min". */
export const exceptionLineText = (e: Pick<TruckingExceptionRecord, "kind" | "waitingMinutes" | "description">): string => {
  if (e.kind === "WAITING_TIME" && e.waitingMinutes) return `Waiting time ${e.waitingMinutes} min`;
  return e.kind === "OTHER" && e.description ? e.description.slice(0, 200) : EXCEPTION_LABEL[e.kind];
};

/**
 * What waiting costs by a tariff's WAITING_TIME surcharge: per started 15 minutes after the free
 * time (LTL 30, FTL 120 minutes by default). PER_HOUR = the hourly price a quarter at a time;
 * FLAT = the price per started 15 minutes. The surcharge's minimum applies once anything is
 * charged; rounded to the tariff's money step. Null when the tariff has no such surcharge (or a
 * calc that cannot price time): the amount must then be typed.
 */
export function waitingCharge(surcharge: TariffSurcharge | null, minutes: number, freeMinutes: number, moneyStep: number): number | null {
  if (!surcharge || (surcharge.calc !== "PER_HOUR" && surcharge.calc !== "FLAT")) return null;
  const quarters = Math.ceil(Math.max(0, minutes - freeMinutes) / 15);
  if (!quarters) return 0;
  const raw = surcharge.calc === "PER_HOUR" ? (quarters * surcharge.value) / 4 : quarters * surcharge.value;
  return roundToStep(Math.max(raw, surcharge.min ?? 0), moneyStep);
}

/** The free waiting time of a consignment's scope. */
export const freeMinutesFor = (scope: TariffScope, free: WaitingFreeTime): number => (scope === "LTL" ? free.ltlMinutes : free.ftlMinutes);

/** An exception as the API shows it. */
export const exceptionItem = (e: TruckingExceptionRecord): DeliveryException => ({
  id: e.id,
  consignmentId: e.consignmentId,
  legId: e.legId,
  kind: e.kind,
  failedReason: e.failedReason,
  cause: e.cause,
  decision: e.decision,
  amount: e.amount,
  currency: e.currency,
  description: e.description,
  pieces: e.pieces,
  waitingMinutes: e.waitingMinutes,
  warehouseExceptionId: e.warehouseExceptionId,
  createdAt: e.createdAt.toISOString(),
  createdBy: e.createdBy,
  decidedAt: e.decidedAt ? e.decidedAt.toISOString() : null,
  decidedBy: e.decidedBy,
  closedAt: e.closedAt ? e.closedAt.toISOString() : null,
  photos: e.photos,
});
