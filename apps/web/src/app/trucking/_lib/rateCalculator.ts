import type { RateLevelResult, RateRequest, TestLaneRequest } from "@/hooks/useTrucking";
import { formatDate } from "@/lib/date";
import { isValidPsc } from "./hauliers";
import type { TariffScope } from "./tariffs";

// Pure helpers of the rate calculator: the form, its checks, the request it sends and how a
// promised date reads.

export type RateExtras = RateRequest["extras"];

/** What is typed into the calculator; postcodes are kept as their digits. */
export interface RateForm {
  fromPsc: string;
  toPsc: string;
  pickupDate: string;
  /** "HH:MM" Prague; null = before the cut-off. */
  pickupTime: string | null;
  scope: TariffScope;
  pieces: number;
  palletPlaces: number;
  ldm: number;
  weightKg: number;
  cbm: number;
  extras: RateExtras;
  customerId: string | null;
  includeBuy: boolean;
  includeInternal: boolean;
}

export const NO_EXTRAS: RateExtras = {
  adr: false,
  tailLift: false,
  avizace: false,
  timeWindow: false,
  b2c: false,
  nonStackable: false,
  waitingHours: 0,
  declaredValueCzk: null,
};

export function emptyRateForm(pickupDate: string): RateForm {
  return {
    fromPsc: "",
    toPsc: "",
    pickupDate,
    pickupTime: null,
    scope: "LTL",
    pieces: 1,
    palletPlaces: 0,
    ldm: 0,
    weightKg: 0,
    cbm: 0,
    extras: NO_EXTRAS,
    customerId: null,
    includeBuy: true,
    includeInternal: false,
  };
}

const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const notNegative = (n: number) => Number.isFinite(n) && n >= 0;

/** Why the calculator cannot price yet, one line per problem. */
export function rateFormProblems(f: RateForm): string[] {
  const out: string[] = [];
  if (!isValidPsc(f.fromPsc)) out.push("From postcode has 5 digits");
  if (!isValidPsc(f.toPsc)) out.push("To postcode has 5 digits");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.pickupDate)) out.push("Pick-up date is required");
  if (f.pickupTime != null && !isTime(f.pickupTime)) out.push("Pick-up time must be HH:MM");
  const measures = [f.pieces, f.palletPlaces, f.ldm, f.weightKg, f.cbm, f.extras.waitingHours];
  if (!measures.every(notNegative)) out.push("Quantities cannot be negative");
  if (f.extras.declaredValueCzk != null && !notNegative(f.extras.declaredValueCzk)) out.push("Declared value cannot be negative");
  // A trip price needs no quantities; anything priced by weight, pallets or LDM does.
  if (f.scope === "LTL" && f.weightKg <= 0 && f.palletPlaces <= 0 && f.ldm <= 0 && f.cbm <= 0) out.push("Enter the weight, pallet places, LDM or volume");
  return out;
}

/** The request the calculator sends: every active service level. */
export function toRateRequest(f: RateForm): RateRequest {
  return {
    fromPostcode: f.fromPsc,
    toPostcode: f.toPsc,
    pickupDate: f.pickupDate,
    pickupTime: f.pickupTime,
    scope: f.scope,
    pieces: f.pieces,
    palletPlaces: f.palletPlaces,
    ldm: f.ldm,
    weightKg: f.weightKg,
    cbm: f.cbm,
    extras: f.extras,
    customerId: f.customerId,
    serviceLevels: null,
    includeBuy: f.includeBuy,
    includeInternal: f.includeInternal,
  };
}

/** The lane a tariff version is tried on in the upload wizard: no pick-up time, customer or other sides. */
export function toTestLaneRequest(f: RateForm): TestLaneRequest {
  return {
    fromPostcode: f.fromPsc,
    toPostcode: f.toPsc,
    pickupDate: f.pickupDate,
    pieces: f.pieces,
    palletPlaces: f.palletPlaces,
    ldm: f.ldm,
    weightKg: f.weightKg,
    cbm: f.cbm,
    extras: f.extras,
  };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Tue 20.10.2026, by 10:00"; "Date agreed per order" when the level has no fixed date. */
export function promisedLabel(r: Pick<RateLevelResult, "promisedDate" | "promisedTime">): string {
  if (!r.promisedDate) return "Date agreed per order";
  const weekday = WEEKDAYS[new Date(`${r.promisedDate}T12:00:00Z`).getUTCDay()];
  return `${weekday} ${formatDate(r.promisedDate)}${r.promisedTime ? `, ${r.promisedTime}` : ""}`;
}

/** The cheapest suitable haulier the engine put first (preferred lane first), or null. */
export function bestBuy(r: Pick<RateLevelResult, "buy">) {
  return r.buy[0] ?? null;
}
