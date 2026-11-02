// A shipment's freight tons (W/M), as the web works them out (apps/web/src/lib/freightTons.ts):
// weight and volume from its cargo dimensions when they have any, else its typed totals, and the
// greater of tons and cbm. A master job's costs are split by it, so both sides must agree.

interface DimensionLine {
  pieces: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  weightPerPcKg: string;
}

const num = (v: string | null | undefined) => parseFloat(v ?? "") || 0;

export function freightTons(
  dimensions: DimensionLine[],
  totals: { totalWeightTons?: string | null; totalVolumeCbm?: string | null },
): { tons: number; cbm: number; freightTon: number } {
  let weightKg = 0;
  let volumeCbm = 0;
  for (const d of dimensions) {
    const pieces = num(d.pieces);
    weightKg += pieces * num(d.weightPerPcKg);
    volumeCbm += (pieces * num(d.lengthCm) * num(d.widthCm) * num(d.heightCm)) / 1_000_000;
  }
  const tons = weightKg > 0 ? weightKg / 1000 : num(totals.totalWeightTons);
  const cbm = volumeCbm > 0 ? volumeCbm : num(totals.totalVolumeCbm);
  return { tons, cbm, freightTon: Math.max(tons, cbm) };
}
