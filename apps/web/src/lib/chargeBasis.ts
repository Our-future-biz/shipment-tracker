// What a shipment's freight is charged by, from its weight and volume (owner decision, 18 Nov 2026:
// shown beside the remeasurement on Warehouse and Cargo Details, and on Costs Breakdown after an
// accepted one). Air: chargeable weight in kg, the greater of the gross weight and the volumetric
// weight (m³ × 1,000,000 ÷ 6000, the standard air divisor Sales quotes use too). Every other mode:
// W/M, the greater of tons and m³. Pure.

export const AIR_DIVISOR = 6000;

export interface ChargeBasis {
  /** "Chargeable weight (kg)" or "W/M". */
  label: string;
  /** Short, for running text: "chargeable weight" or "W/M". */
  name: string;
  value: number;
  unit: string;
  digits: number;
}

export const isAirFreight = (freightMode: string | null | undefined): boolean => (freightMode ?? "").trim().toLowerCase().startsWith("air");

/**
 * Whether the freight is charged by its weight or measure at all (council finding K5): not a sea
 * Full Load (FCL), charged per container - the remeasurement then shows only the figures that
 * changed, without W/M.
 */
export const chargedByWeightOrMeasure = (freightMode: string | null | undefined, loadType: string | null | undefined): boolean =>
  !((freightMode ?? "").trim().toLowerCase() === "sea freight" && (loadType ?? "").trim().toLowerCase() === "full load");

export function chargeBasis(freightMode: string | null | undefined, weightKg: number, volumeCbm: number): ChargeBasis {
  const kg = weightKg > 0 ? weightKg : 0;
  const m3 = volumeCbm > 0 ? volumeCbm : 0;
  if (isAirFreight(freightMode)) {
    const value = Math.round(Math.max(kg, (m3 * 1_000_000) / AIR_DIVISOR) * 10) / 10;
    return { label: "Chargeable weight (kg)", name: "chargeable weight", value, unit: "kg", digits: 1 };
  }
  const value = Math.round(Math.max(kg / 1000, m3) * 1000) / 1000;
  return { label: "W/M", name: "W/M", value, unit: "", digits: 3 };
}

/** "5,775.0 kg" / "34.650": the figure with its unit, "—" when there is none. */
export function fmtChargeBasis(b: ChargeBasis): string {
  if (!(b.value > 0)) return "—";
  const n = b.value.toLocaleString("en-US", { minimumFractionDigits: b.digits, maximumFractionDigits: b.digits });
  return b.unit ? `${n} ${b.unit}` : n;
}
