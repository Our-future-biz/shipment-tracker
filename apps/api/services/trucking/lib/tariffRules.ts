import { APIError } from "encore.dev/api";
import { addDays, isRealYmd } from "../../../lib/businessDate";
import { isUuid } from "../../../lib/uuid";
import { normaliseCzPostcode } from "./haulierRules";
import { SERVICE_LEVEL_CODES } from "./settingsRules";
import type {
  BandBasis,
  PriceType,
  RateExtras,
  RateRequest,
  ServiceLevelCode,
  SurchargeCalc,
  SurchargeCode,
  TariffMode,
  TariffScope,
  TariffSide,
  TariffVersionInput,
  TariffVersionStatus,
  ZoneBy,
} from "../interfaces/interfaces";

// Tariff rules: what a tariff, a version, a fuel index month and a rate request must look like to
// be accepted, and the status of a version on a day. Prices that are merely wrong (negative,
// gaps, unknown zones…) are not refused here: they are findings (lib/tariffValidation.ts), so a
// draft can be saved and fixed.

export const SIDES: readonly TariffSide[] = ["BUY", "SELL", "INTERNAL"];
export const SCOPES: readonly TariffScope[] = ["LTL", "FTL", "LINEHAUL"];
const MODES: readonly TariffMode[] = ["MATRIX", "DISCOUNT"];
const ZONE_BY: readonly ZoneBy[] = ["DESTINATION", "ORIGIN"];
const BASES: readonly BandBasis[] = ["KG", "PALLET", "LDM", "TRIP"];
const PRICE_TYPES: readonly PriceType[] = ["FLAT", "PER_UNIT", "PER_100KG"];
const SURCHARGE_CODES: readonly SurchargeCode[] = [
  "FUEL", "TOLL", "ADR", "TAIL_LIFT", "AVIZACE", "TIME_WINDOW", "B2C", "WAITING_TIME", "REDELIVERY", "INSURANCE", "REMOTE_AREA", "NON_STACKABLE",
];
const SURCHARGE_CALCS: readonly SurchargeCalc[] = ["PCT", "FLAT", "PER_KG", "PER_PALLET", "PER_HOUR", "PCT_OF_VALUE", "FUEL_INDEX"];

const MAX_ZONES = 1000;
const MAX_BANDS = 200;
const MAX_RATES = 50000;
const MAX_SURCHARGES = 100;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const bad = (message: string) => APIError.invalidArgument(message);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], what: string): T => {
  if (!allowed.includes(v as T)) throw bad(`${what} must be ${allowed.slice(0, -1).join(", ")} or ${allowed[allowed.length - 1]}`);
  return v as T;
};

const text = (v: unknown, what: string, max: number, required: boolean): string => {
  const s = typeof v === "string" ? v.trim() : "";
  if (required && !s) throw bad(`${what} is required`);
  if (s.length > max) throw bad(`${what} can be at most ${max} characters long`);
  return s;
};

/** A discount: above −100 and below 100 (negative = uplift). */
const discount = (v: unknown): number => {
  if (!isNumber(v) || v <= -100 || v >= 100) throw bad("The discount must be a percentage above −100 and below 100 (negative = uplift)");
  return v;
};

// ---- tariff -------------------------------------------------------------------------------------

export interface TariffCreateInput {
  side: TariffSide;
  scope: TariffScope;
  mode: TariffMode;
  name: string;
  ownerCustomerId: string | null;
  currency: "CZK" | "EUR";
  zoneBy: ZoneBy;
  discountPercent: number | null;
}

/** A new tariff as it is stored; the owner must still be checked against the Customer Database. */
export function cleanTariffCreate(input: TariffCreateInput): TariffCreateInput {
  const side = oneOf(input.side, SIDES, "The side");
  const scope = oneOf(input.scope, SCOPES, "The scope");
  const mode = oneOf(input.mode ?? "MATRIX", MODES, "The mode");
  const owner = input.ownerCustomerId ? String(input.ownerCustomerId) : null;
  if (owner !== null && !isUuid(owner)) throw bad("Unknown customer");
  if (side === "BUY" && !owner) throw bad("A buy tariff belongs to a haulier: choose one");
  if (side === "INTERNAL" && owner) throw bad("The internal tariff has no owner");
  if (mode === "DISCOUNT" && (side !== "SELL" || !owner)) throw bad("Only a customer's sell tariff can be a discount off the Standard list");
  return {
    side,
    scope,
    mode,
    name: text(input.name, "The name", 120, true),
    ownerCustomerId: owner,
    currency: oneOf(input.currency, ["CZK", "EUR"] as const, "The currency"),
    zoneBy: oneOf(input.zoneBy ?? "DESTINATION", ZONE_BY, "The zone postcode"),
    discountPercent: mode === "DISCOUNT" ? discount(input.discountPercent) : null,
  };
}

export interface TariffUpdateInput {
  name?: string;
  discountPercent?: number;
  zoneBy?: ZoneBy;
}

/** The changed fields of a tariff; discountPercent only on a DISCOUNT tariff. */
export function cleanTariffUpdate(input: TariffUpdateInput, mode: TariffMode): TariffUpdateInput {
  const out: TariffUpdateInput = {};
  if (input.name !== undefined) out.name = text(input.name, "The name", 120, true);
  if (input.zoneBy !== undefined) out.zoneBy = oneOf(input.zoneBy, ZONE_BY, "The zone postcode");
  if (input.discountPercent !== undefined && input.discountPercent !== null) {
    if (mode !== "DISCOUNT") throw bad("Only a discount tariff has a discount");
    out.discountPercent = discount(input.discountPercent);
  }
  return out;
}

// ---- version input --------------------------------------------------------------------------------

const list = <T>(v: unknown, what: string, max: number): T[] => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw bad(`${what} must be a list`);
  if (v.length > max) throw bad(`At most ${max} ${what.toLowerCase()} are allowed`);
  return v as T[];
};

/** A number as sent; anything else becomes NaN, which the findings report (and JSON stores as null). */
const num = (v: unknown): number => (isNumber(v) ? v : NaN);

/** A postcode as stored: 5 digits when it is one, else the text as sent (the findings report it). */
const psc = (v: unknown): string => normaliseCzPostcode(v) ?? (typeof v === "string" ? v.trim().slice(0, 20) : "");

/**
 * A version input as it is stored: the shape and the codes must be right (else invalid_argument);
 * numbers, postcodes and references are kept as sent and judged by the findings.
 */
export function cleanVersionInput(input: TariffVersionInput): TariffVersionInput {
  if (!input || typeof input !== "object") throw bad("The tariff version is missing");
  if (typeof input.validFrom !== "string" || !isRealYmd(input.validFrom)) throw bad("Valid from must be a date like 2026-12-31");
  if (input.validTo !== null && input.validTo !== undefined && (typeof input.validTo !== "string" || !isRealYmd(input.validTo))) {
    throw bad("Valid to must be a date like 2026-12-31, or empty");
  }
  const level = (v: unknown, where: string) => oneOf(v, SERVICE_LEVEL_CODES, `${where}: the service level`);
  return {
    validFrom: input.validFrom,
    validTo: input.validTo ?? null,
    factors: {
      kgPerLdm: num(input.factors?.kgPerLdm),
      kgPerCbm: num(input.factors?.kgPerCbm),
      kgPerPalletPlace: num(input.factors?.kgPerPalletPlace),
    },
    rounding: { weightStepKg: num(input.rounding?.weightStepKg), moneyStep: num(input.rounding?.moneyStep) },
    zones: list<TariffVersionInput["zones"][number]>(input.zones, "Zones", MAX_ZONES).map((z, i) => ({
      code: text(z?.code, `Zone ${i + 1}: the code`, 20, false),
      label: text(z?.label, `Zone ${i + 1}: the label`, 120, false),
      postcodeFrom: psc(z?.postcodeFrom),
      postcodeTo: psc(z?.postcodeTo),
      remote: z?.remote === true,
    })),
    bands: list<TariffVersionInput["bands"][number]>(input.bands, "Bands", MAX_BANDS).map((b, i) => ({
      id: text(b?.id, `Band ${i + 1}: the id`, 40, false),
      basis: oneOf(b?.basis, BASES, `Band ${i + 1}: the basis`),
      fromExcl: num(b?.fromExcl),
      toIncl: b?.toIncl === null || b?.toIncl === undefined ? null : num(b.toIncl),
    })),
    rates: list<TariffVersionInput["rates"][number]>(input.rates, "Rates", MAX_RATES).map((r, i) => ({
      serviceLevel: level(r?.serviceLevel, `Rate ${i + 1}`),
      zoneCode: text(r?.zoneCode, `Rate ${i + 1}: the zone`, 20, false),
      bandId: text(r?.bandId, `Rate ${i + 1}: the band`, 40, false),
      amount: num(r?.amount),
      priceType: oneOf(r?.priceType, PRICE_TYPES, `Rate ${i + 1}: the price type`),
    })),
    minCharges: list<TariffVersionInput["minCharges"][number]>(input.minCharges, "Minimum charges", MAX_RATES).map((m, i) => ({
      serviceLevel: level(m?.serviceLevel, `Minimum charge ${i + 1}`),
      zoneCode: text(m?.zoneCode, `Minimum charge ${i + 1}: the zone`, 20, false),
      amount: num(m?.amount),
    })),
    surcharges: list<TariffVersionInput["surcharges"][number]>(input.surcharges, "Surcharges", MAX_SURCHARGES).map((s, i) => ({
      code: oneOf(s?.code, SURCHARGE_CODES, `Surcharge ${i + 1}: the code`),
      calc: oneOf(s?.calc, SURCHARGE_CALCS, `Surcharge ${i + 1}: the calculation`),
      value: s?.calc === "FUEL_INDEX" && !isNumber(s?.value) ? 0 : num(s?.value),
      min: s?.min === null || s?.min === undefined ? null : num(s.min),
      onBasePlusSurcharges: s?.onBasePlusSurcharges === true,
    })),
    notes: text(input.notes, "The notes", 4000, false),
  };
}

/** The service levels a version prices, in the fixed order. */
export const versionLevels = (v: TariffVersionInput): ServiceLevelCode[] => SERVICE_LEVEL_CODES.filter((c) => v.rates.some((r) => r.serviceLevel === c));

// ---- status ------------------------------------------------------------------------------------

export interface VersionDates {
  validFrom: string;
  validTo: string | null;
  activatedAt: Date | null;
  supersededAt: Date | null;
}

/** The status of a version on `today` (a Prague day). */
export function versionStatus(v: VersionDates, today: string): TariffVersionStatus {
  if (!v.activatedAt) return "DRAFT";
  if (v.supersededAt) return "SUPERSEDED";
  if (v.validFrom > today) return "SCHEDULED";
  if (v.validTo !== null && v.validTo < today) return "EXPIRED";
  return "ACTIVE";
}

/**
 * What activating a version from `validFrom` does to the tariff's binding versions: the one
 * running into `validFrom` ends the day before (close); those starting on or after it were
 * replaced before they started (supersede). Versions that end before `validFrom` stay as they are.
 */
export function activationPlan(
  binding: { id: string; validFrom: string; validTo: string | null }[],
  validFrom: string,
): { close: { id: string; validTo: string }[]; supersede: string[] } {
  const close: { id: string; validTo: string }[] = [];
  const supersede: string[] = [];
  for (const v of binding) {
    if (v.validFrom >= validFrom) supersede.push(v.id);
    else if (v.validTo === null || v.validTo >= validFrom) close.push({ id: v.id, validTo: addDays(validFrom, -1) });
  }
  return { close, supersede };
}

// ---- fuel index --------------------------------------------------------------------------------

export function cleanFuelIndex(month: unknown, percent: unknown): { month: string; percent: number } {
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw bad("The month must look like 2026-10");
  if (!isNumber(percent) || percent < 0 || percent > 100) throw bad("The fuel index must be a percentage from 0 to 100");
  return { month, percent };
}

// ---- rate request ------------------------------------------------------------------------------

/** A rate request with normalised postcodes and checked measures; throws invalid_argument. */
export function cleanRateRequest(r: RateRequest): RateRequest {
  const postcode = (v: unknown, what: string) => {
    const p = normaliseCzPostcode(v);
    if (!p) throw bad(`The ${what} postcode must be a CZ postcode, 5 digits like 110 00`);
    return p;
  };
  const measure = (v: unknown, what: string) => {
    if (!isNumber(v) || v < 0) throw bad(`${what} must be a number, 0 or more`);
    return v;
  };
  if (typeof r.pickupDate !== "string" || !isRealYmd(r.pickupDate)) throw bad("The pickup date must be a date like 2026-12-31");
  const pickupTime = r.pickupTime === null || r.pickupTime === undefined || r.pickupTime === "" ? null : String(r.pickupTime).trim();
  if (pickupTime !== null && !HHMM.test(pickupTime)) throw bad("The pickup time must be a time like 14:30");
  const e: Partial<RateExtras> = r.extras ?? {};
  const declared = e.declaredValueCzk === null || e.declaredValueCzk === undefined ? null : measure(e.declaredValueCzk, "The declared value");
  const levels = r.serviceLevels === null || r.serviceLevels === undefined ? null : list<unknown>(r.serviceLevels, "Service levels", 8).map((l) => oneOf(l, SERVICE_LEVEL_CODES, "A service level"));
  const customerId = r.customerId ? String(r.customerId) : null;
  if (customerId !== null && !isUuid(customerId)) throw bad("Unknown customer");
  const request: RateRequest = {
    fromPostcode: postcode(r.fromPostcode, "pickup"),
    toPostcode: postcode(r.toPostcode, "delivery"),
    pickupDate: r.pickupDate,
    pickupTime,
    scope: oneOf(r.scope, SCOPES, "The scope"),
    pieces: measure(r.pieces ?? 0, "Pieces"),
    palletPlaces: measure(r.palletPlaces ?? 0, "Pallet places"),
    ldm: measure(r.ldm ?? 0, "Loading metres"),
    weightKg: measure(r.weightKg ?? 0, "The weight"),
    cbm: measure(r.cbm ?? 0, "Cubic metres"),
    extras: {
      adr: e.adr === true,
      tailLift: e.tailLift === true,
      avizace: e.avizace === true,
      timeWindow: e.timeWindow === true,
      b2c: e.b2c === true,
      nonStackable: e.nonStackable === true,
      waitingHours: measure(e.waitingHours ?? 0, "Waiting hours"),
      declaredValueCzk: declared,
    },
    customerId,
    serviceLevels: levels ? [...new Set(levels)] : null,
    includeBuy: r.includeBuy === true,
    includeInternal: r.includeInternal === true,
  };
  if (request.weightKg + request.ldm + request.cbm + request.palletPlaces <= 0) throw bad("Give the weight, loading metres, cubic metres or pallet places");
  return request;
}
