import type { interfaces } from "@/lib/api/client";

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
  return out;
}

/** The working days of a service level in words; they follow from its code and are not edited. */
export function workingDaysText(code: interfaces.ServiceLevelCode, days: number): string {
  if (code === "EXP_FIXED") return "Date agreed per order";
  if (days === 0) return "Same day";
  return `${days} working day${days === 1 ? "" : "s"}`;
}
