import { computeDimensionTotals } from "@/lib/columnConfig";

/** The parts of a shipment its freight tons are worked out from. */
interface FreightSource {
  cargoDimensions?: unknown[] | null;
  totalWeightTons?: string | number | null;
  totalVolumeCbm?: string | number | null;
}

/**
 * A shipment's weight (tons) and volume (cbm) - from its cargo dimensions when it has them,
 * else its typed totals - and its freight tons (W/M): the greater of the two.
 */
export function shipmentFreight(s: FreightSource): { tons: number; cbm: number; freightTon: number } {
  const { weightKg, volumeCbm } = computeDimensionTotals(s.cargoDimensions ?? []);
  const manualTons = parseFloat(String(s.totalWeightTons ?? "")) || 0;
  const manualCbm = parseFloat(String(s.totalVolumeCbm ?? "")) || 0;
  const tons = weightKg > 0 ? weightKg / 1000 : manualTons;
  const cbm = volumeCbm > 0 ? volumeCbm : manualCbm;
  return { tons, cbm, freightTon: Math.max(tons, cbm) };
}
