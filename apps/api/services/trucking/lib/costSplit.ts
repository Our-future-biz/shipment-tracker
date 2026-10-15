import type { ChargeableFactors, CostSplitBasis, LoadInput } from "../interfaces/interfaces";

// A trip's buy price split over the legs it carries, by the haulier's cost-split basis
// (chargeable weight, loading metres or pallet places of each leg's consignment), exact to the
// cent. Pure, so every split has its test.

/**
 * `totalCents` split by `weights`, in whole cents, in the order of the weights (largest
 * remainder): each part is rounded down and the cents left over go, one each, to the parts that
 * lost the most in rounding; a tie goes to the part listed first. A weight of 0 gets 0.
 *
 * The same algorithm as invoicing's splitCents (services/invoicing/lib/costSplit.ts); copied
 * because services do not import each other's libraries. Keep the two the same.
 */
export function splitCents(totalCents: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(totalCents)) throw new Error("the total must be a whole number of cents");
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) throw new Error("a weight must be a number of at least 0");
  const sum = weights.reduce((a, w) => a + w, 0);
  if (sum <= 0) throw new Error("at least one weight must be above 0");

  const sign = totalCents < 0 ? -1 : 1;
  const total = Math.abs(totalCents);
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((a, p) => a + p, 0);

  const byRemainder = exact
    .map((x, i) => ({ i, remainder: x - Math.floor(x) }))
    .filter(({ i }) => weights[i]! > 0)
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % byRemainder.length, left -= 1) parts[byRemainder[k]!.i]! += 1;

  return parts.map((p) => p * sign);
}

/** What a leg's consignment weighs in the split. */
export interface SplitLoad {
  /** As priced; null = worked out from the load with the settings' factors */
  chargeableKg: number | null;
  load: Pick<LoadInput, "weightKg" | "ldm" | "cbm" | "palletPlaces">;
}

/** Chargeable kg of a load: the largest of the actual weight and the volume measures. */
export function chargeableKgOf(s: SplitLoad, f: ChargeableFactors): number {
  if (s.chargeableKg !== null && s.chargeableKg > 0) return s.chargeableKg;
  const l = s.load;
  return Math.max(l.weightKg, l.ldm * f.kgPerLdm, l.cbm * f.kgPerCbm, l.palletPlaces * f.kgPerPalletPlace);
}

/** The weight of one leg under the basis. */
export function splitWeight(basis: CostSplitBasis, s: SplitLoad, f: ChargeableFactors): number {
  switch (basis) {
    case "ldm":
      return s.load.ldm;
    case "pallet_places":
      return s.load.palletPlaces;
    default:
      return chargeableKgOf(s, f);
  }
}

/**
 * `totalCzk` split over the legs by the basis: leg id → CZK (two decimals), adding up to the
 * total exactly. When no leg weighs anything under the basis (all 0), the legs share equally.
 */
export function splitTripCost(totalCzk: number, legs: (SplitLoad & { id: string })[], basis: CostSplitBasis, f: ChargeableFactors): Map<string, number> {
  const out = new Map<string, number>();
  if (!legs.length) return out;
  let weights = legs.map((l) => splitWeight(basis, l, f));
  if (weights.every((w) => w <= 0)) weights = legs.map(() => 1);
  const cents = splitCents(Math.round(totalCzk * 100), weights);
  legs.forEach((l, i) => out.set(l.id, cents[i]! / 100));
  return out;
}
