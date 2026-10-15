import { APIError } from "encore.dev/api";
import type {
  ChargeableFactors,
  MarginFloor,
  ServiceLevelCode,
  ServiceLevelSetting,
  TransportOrderTexts,
  TruckingSettingsInput,
  VehicleTypeSetting,
} from "../interfaces/interfaces";
import { cleanHub, EMPTY_HUB } from "./ltlRules";

// The trucking settings: defaults when a company has saved none, and the checks a save must pass.

/** All service levels, in the order they are always shown, with their fixed working days. */
export const SERVICE_LEVEL_CODES: readonly ServiceLevelCode[] = ["D1", "D2", "D3", "D4", "EXP_SAMEDAY", "EXP_1000", "EXP_1200", "EXP_FIXED"];

const WORKING_DAYS: Record<ServiceLevelCode, number> = {
  D1: 1,
  D2: 2,
  D3: 3,
  D4: 4,
  EXP_SAMEDAY: 0,
  EXP_1000: 1,
  EXP_1200: 1,
  EXP_FIXED: 0,
};

const level = (code: ServiceLevelCode, label: string, cutoff: string): ServiceLevelSetting => ({
  code,
  label,
  workingDays: WORKING_DAYS[code],
  cutoff,
  active: true,
});

export const DEFAULT_SERVICE_LEVELS: ServiceLevelSetting[] = [
  level("D1", "+1 day", "12:00"),
  level("D2", "+2 days", "12:00"),
  level("D3", "+3 days", "12:00"),
  level("D4", "+4 days", "12:00"),
  level("EXP_SAMEDAY", "Express same day", "10:00"),
  level("EXP_1000", "Express by 10:00", "15:00"),
  level("EXP_1200", "Express by 12:00", "15:00"),
  level("EXP_FIXED", "Express fixed date", "15:00"),
];

const vehicle = (code: string, label: string, capacityLdm: number, capacityKg: number, palletPlaces: number, tailLift: boolean): VehicleTypeSetting => ({
  code,
  label,
  capacityLdm,
  capacityKg,
  palletPlaces,
  tailLift,
  active: true,
});

export const DEFAULT_VEHICLE_TYPES: VehicleTypeSetting[] = [
  vehicle("van", "Van", 3.0, 1200, 6, false),
  vehicle("solo_72", "Solo truck 7.2 m", 7.2, 9000, 18, false),
  vehicle("solo_72_lift", "Solo truck 7.2 m with tail lift", 7.2, 9000, 18, true),
  vehicle("tautliner_136", "Tautliner 13.6 m", 13.6, 24000, 33, false),
  vehicle("mega_136", "Mega trailer 13.6 m", 13.6, 24000, 33, false),
];

export const DEFAULT_FACTORS: ChargeableFactors = { kgPerLdm: 1750, kgPerCbm: 250, kgPerPalletPlace: 400 };

export const DEFAULT_MARGIN_FLOOR: MarginFloor = { percent: 8, minAmountCzk: 300 };

export const DEFAULT_TRANSPORT_ORDER: TransportOrderTexts = {
  emailSubject: "Transport order {orderRef} – {date}",
  emailBody:
    "Dear {haulier},\n\nplease find attached our transport order {orderRef} for {date}.\n" +
    "Kindly confirm the order by return e-mail and let us know the vehicle registration and the driver's name.\n\n" +
    "Thank you and kind regards",
};

export const DEFAULT_SETTINGS: TruckingSettingsInput = {
  serviceLevels: DEFAULT_SERVICE_LEVELS,
  vehicleTypes: DEFAULT_VEHICLE_TYPES,
  factors: DEFAULT_FACTORS,
  marginFloor: DEFAULT_MARGIN_FLOOR,
  transportOrder: DEFAULT_TRANSPORT_ORDER,
  hub: EMPTY_HUB,
};

/** Largest loading length a vehicle may have: mega trailers and road trains (13.6 m is a standard trailer). */
export const MAX_VEHICLE_LDM = 15.4;
const MAX_VEHICLE_TYPES = 50;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const VEHICLE_CODE = /^[a-z0-9_]{1,40}$/;

const bad = (message: string) => APIError.invalidArgument(message);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const text = (v: unknown, what: string, max: number, required = true): string => {
  const s = typeof v === "string" ? v.trim() : "";
  if (required && !s) throw bad(`${what} is required`);
  if (s.length > max) throw bad(`${what} can be at most ${max} characters long`);
  return s;
};

/** All 8 service levels, each once, returned in the fixed order with their fixed working days. */
export function cleanServiceLevels(levels: ServiceLevelSetting[]): ServiceLevelSetting[] {
  if (!Array.isArray(levels)) throw bad("Service levels are missing");
  const byCode = new Map<string, ServiceLevelSetting>();
  for (const l of levels) {
    if (!SERVICE_LEVEL_CODES.includes(l?.code)) throw bad(`Unknown service level "${String(l?.code)}"`);
    if (byCode.has(l.code)) throw bad(`Service level ${l.code} is listed twice`);
    byCode.set(l.code, l);
  }
  const missing = SERVICE_LEVEL_CODES.filter((c) => !byCode.has(c));
  if (missing.length) throw bad(`All 8 service levels must be sent; missing: ${missing.join(", ")}`);
  return SERVICE_LEVEL_CODES.map((code) => {
    const l = byCode.get(code)!;
    const cutoff = typeof l.cutoff === "string" ? l.cutoff.trim() : "";
    if (!HHMM.test(cutoff)) throw bad(`Service level ${code}: the cut-off must be a time like 12:00`);
    return {
      code,
      label: text(l.label, `Service level ${code}: the label`, 60),
      workingDays: WORKING_DAYS[code],
      cutoff,
      active: l.active === true,
    };
  });
}

export function cleanVehicleTypes(types: VehicleTypeSetting[]): VehicleTypeSetting[] {
  if (!Array.isArray(types) || !types.length) throw bad("At least one vehicle type is needed");
  if (types.length > MAX_VEHICLE_TYPES) throw bad(`At most ${MAX_VEHICLE_TYPES} vehicle types are allowed`);
  const seen = new Set<string>();
  return types.map((t) => {
    const code = typeof t?.code === "string" ? t.code.trim() : "";
    if (!VEHICLE_CODE.test(code)) throw bad(`Vehicle type code "${code}" may only use a-z, 0-9 and _ (at most 40 characters)`);
    if (seen.has(code)) throw bad(`Vehicle type code "${code}" is used twice`);
    seen.add(code);
    const label = text(t.label, `Vehicle type ${code}: the name`, 80);
    if (!isNumber(t.capacityLdm) || t.capacityLdm <= 0 || t.capacityLdm > MAX_VEHICLE_LDM) {
      throw bad(`Vehicle type ${code}: loading metres must be more than 0 and at most ${MAX_VEHICLE_LDM}`);
    }
    if (!isNumber(t.capacityKg) || t.capacityKg <= 0) throw bad(`Vehicle type ${code}: the payload in kg must be more than 0`);
    if (!Number.isInteger(t.palletPlaces) || t.palletPlaces < 0) throw bad(`Vehicle type ${code}: pallet places must be a whole number, 0 or more`);
    return {
      code,
      label,
      capacityLdm: t.capacityLdm,
      capacityKg: t.capacityKg,
      palletPlaces: t.palletPlaces,
      tailLift: t.tailLift === true,
      active: t.active === true,
    };
  });
}

export function cleanFactors(f: ChargeableFactors): ChargeableFactors {
  const factor = (v: unknown, what: string): number => {
    if (!isNumber(v) || v <= 0) throw bad(`${what} must be more than 0`);
    return v;
  };
  return {
    kgPerLdm: factor(f?.kgPerLdm, "Kg per loading metre"),
    kgPerCbm: factor(f?.kgPerCbm, "Kg per cubic metre"),
    kgPerPalletPlace: factor(f?.kgPerPalletPlace, "Kg per pallet place"),
  };
}

export function cleanMarginFloor(m: MarginFloor): MarginFloor {
  if (!isNumber(m?.percent) || m.percent < 0 || m.percent > 100) throw bad("The margin floor percent must be between 0 and 100");
  if (!isNumber(m?.minAmountCzk) || m.minAmountCzk < 0) throw bad("The minimum margin in CZK cannot be negative");
  return { percent: m.percent, minAmountCzk: m.minAmountCzk };
}

export function cleanTransportOrder(t: TransportOrderTexts): TransportOrderTexts {
  return {
    emailSubject: text(t?.emailSubject, "The transport-order e-mail subject", 200),
    emailBody: text(t?.emailBody, "The transport-order e-mail text", 5000),
  };
}

/** The settings as they are saved; throws invalid_argument with a plain-English message. */
export function cleanSettings(input: TruckingSettingsInput): TruckingSettingsInput {
  return {
    serviceLevels: cleanServiceLevels(input.serviceLevels),
    vehicleTypes: cleanVehicleTypes(input.vehicleTypes),
    factors: cleanFactors(input.factors),
    marginFloor: cleanMarginFloor(input.marginFloor),
    transportOrder: cleanTransportOrder(input.transportOrder),
    hub: cleanHub(input.hub),
  };
}

/**
 * Stored settings as the API shows them: every service level in the fixed order (a level missing
 * from an older row comes from the defaults), and the defaults for a part that is missing.
 */
export function readSettings(stored: Partial<TruckingSettingsInput> | null): TruckingSettingsInput {
  if (!stored) return DEFAULT_SETTINGS;
  const levels = Array.isArray(stored.serviceLevels) ? stored.serviceLevels : [];
  return {
    serviceLevels: DEFAULT_SERVICE_LEVELS.map((d) => levels.find((l) => l.code === d.code) ?? d),
    vehicleTypes: Array.isArray(stored.vehicleTypes) ? stored.vehicleTypes : DEFAULT_VEHICLE_TYPES,
    factors: stored.factors ?? DEFAULT_FACTORS,
    marginFloor: stored.marginFloor ?? DEFAULT_MARGIN_FLOOR,
    transportOrder: stored.transportOrder ?? DEFAULT_TRANSPORT_ORDER,
    hub: stored.hub ?? EMPTY_HUB,
  };
}

/** The parts that differ between two settings, with their before and after (for the event log). */
export function settingsChanges(before: TruckingSettingsInput, after: TruckingSettingsInput): Record<string, { before: unknown; after: unknown }> {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of Object.keys(after) as (keyof TruckingSettingsInput)[]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changes[key] = { before: before[key], after: after[key] };
  }
  return changes;
}
