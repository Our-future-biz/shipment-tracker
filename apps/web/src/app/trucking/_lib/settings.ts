import type { interfaces } from "@/lib/api/client";
import { isValidPsc } from "./hauliers";

// Checks of the Trucking settings, the same limits the server holds them to.

export const MAX_LDM = 15.4;
export const VEHICLE_CODE_PATTERN = /^[a-z0-9_]+$/;
export const TEXT_PLACEHOLDERS = ["{orderRef}", "{haulier}", "{date}"] as const;

export interface SettingsDraft {
  serviceLevels: interfaces.ServiceLevelSetting[];
  vehicleTypes: interfaces.VehicleTypeSetting[];
  factors: interfaces.ChargeableFactors;
  marginFloor: interfaces.MarginFloor;
  transportOrder: interfaces.TransportOrderTexts;
  hub: interfaces.HubAddress;
  waitingFreeMinutes: interfaces.WaitingFreeMinutes;
}

/** Free time before waiting time is charged, as the server defaults it. */
export const DEFAULT_WAITING_FREE: interfaces.WaitingFreeMinutes = { LTL: 30, FTL: 120 };

/** The free waiting time of the settings; settings saved before Phase 6 have none yet. */
export const waitingFreeOf = (settings: Pick<interfaces.TruckingSettings, "waitingFreeMinutes"> | null | undefined): interfaces.WaitingFreeMinutes => ({
  ...DEFAULT_WAITING_FREE,
  ...settings?.waitingFreeMinutes,
});

export const EMPTY_HUB: interfaces.HubAddress = { name: "", street: "", postcode: "", city: "", country: "CZ" };

/** Whether our warehouse's address is set: LTL planning needs it. */
export const hubIsSet = (hub: interfaces.HubAddress | null | undefined) => !!hub && !!hub.street.trim() && isValidPsc(hub.postcode) && !!hub.city.trim();

export const HUB_MISSING_TEXT = "Set the warehouse address in Trucking settings";

/** Why the hub address cannot be saved: left empty is fine (planning then waits), half-filled is not. */
export function hubProblems(hub: interfaces.HubAddress): string[] {
  const filled = [hub.name, hub.street, hub.postcode, hub.city].some((v) => v.trim());
  if (!filled) return [];
  const out: string[] = [];
  if (!hub.name.trim()) out.push("Our warehouse: name");
  if (!hub.street.trim()) out.push("Our warehouse: street");
  if (!isValidPsc(hub.postcode)) out.push("Our warehouse: postcode (PSČ) has 5 digits");
  if (!hub.city.trim()) out.push("Our warehouse: city");
  return out;
}

const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const positive = (n: number) => Number.isFinite(n) && n > 0;

/** Why one vehicle type cannot be saved, or [] when it can. */
export function vehicleTypeProblems(v: interfaces.VehicleTypeSetting): string[] {
  const out: string[] = [];
  if (!VEHICLE_CODE_PATTERN.test(v.code)) out.push("code uses a–z, 0–9 and _ only");
  if (!v.label.trim()) out.push("label is required");
  if (!positive(v.capacityLdm) || v.capacityLdm > MAX_LDM) out.push(`LDM must be above 0 and at most ${MAX_LDM}`);
  if (!positive(v.capacityKg)) out.push("kg must be above 0");
  if (!Number.isInteger(v.palletPlaces) || v.palletPlaces < 0) out.push("pallet places must be a whole number, 0 or more");
  return out;
}

/** Why the settings cannot be saved, one line per problem. */
export function settingsProblems(d: SettingsDraft): string[] {
  const out: string[] = [];
  for (const s of d.serviceLevels) if (!isTime(s.cutoff)) out.push(`${s.label}: cut-off must be HH:MM`);
  const codes = new Set<string>();
  d.vehicleTypes.forEach((v, i) => {
    const name = v.label.trim() || `Vehicle type ${i + 1}`;
    for (const p of vehicleTypeProblems(v)) out.push(`${name}: ${p}`);
    if (codes.has(v.code)) out.push(`${name}: code ${v.code} is used twice`);
    codes.add(v.code);
  });
  if (!positive(d.factors.kgPerLdm) || !positive(d.factors.kgPerCbm) || !positive(d.factors.kgPerPalletPlace)) {
    out.push("Chargeable-weight factors must be above 0");
  }
  if (!(d.marginFloor.percent >= 0 && d.marginFloor.percent <= 100)) out.push("Margin floor % must be 0–100");
  if (!(d.marginFloor.minAmountCzk >= 0)) out.push("Minimum margin cannot be negative");
  if (!d.transportOrder.emailSubject.trim()) out.push("Transport-order e-mail subject is required");
  if (!d.transportOrder.emailBody.trim()) out.push("Transport-order e-mail body is required");
  out.push(...hubProblems(d.hub));
  for (const scope of ["LTL", "FTL"] as const) {
    const minutes = d.waitingFreeMinutes[scope];
    if (!Number.isInteger(minutes) || minutes < 0) out.push(`Free waiting time ${scope}: whole minutes, 0 or more`);
  }
  return out;
}

/** The working days of a service level in words; they follow from its code and are not edited. */
export function workingDaysText(code: interfaces.ServiceLevelCode, days: number): string {
  if (code === "EXP_FIXED") return "Date agreed per order";
  if (days === 0) return "Same day";
  return `${days} working day${days === 1 ? "" : "s"}`;
}
