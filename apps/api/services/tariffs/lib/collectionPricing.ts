import type { CollectionConsignment, CollectionLayout, CollectionPrice, CollectionSurchargeLine } from "../interfaces/interfaces";
import { roundCents } from "./money";

// What a collections tariff asks for a consignment, once its table and zone are known: the
// chargeable weight (the real weight, or the volume counted as weight by the tariff's own rule,
// whichever is more), the weight row it falls in, that row's price in the zone, and the surcharges.
// Pure.

/** A weight row of a price table as pricing needs it. */
export interface PricingRow {
  matrix: number;
  weightToKg: number;
  volumeToCbm: number | null;
  prices: (number | null)[];
}

/** Why a tariff cannot price a consignment. */
export type PricingRefusal =
  | "no_weight" // no weight is known, and no volume the tariff counts as weight
  | "too_heavy" // heavier than the table's last row
  | "too_big" // more volume than the table's volume column goes to
  | "no_price"; // the row has no price in the zone

export type Pricing = ({ ok: true } & CollectionPrice) | { ok: false; reason: PricingRefusal; chargeableKg?: number; maxKg?: number };

/** "up to 150 kg", "up to 0.5 kg" */
export const bandLabel = (kg: number) => `up to ${kg.toLocaleString("en-US")} kg`;

/**
 * What a volume counts as in kg: with a volume column, the weight of the first row whose volume it
 * fits (TOPTRANS: up to 0.12 m³ counts as 5 kg); with a factor, volume × kg per m³; otherwise 0.
 * Infinity when the volume is over the column's last row.
 */
export function volumeKg(rows: PricingRow[], kgPerCbm: number | null, cbm: number): number {
  if (cbm <= 0) return 0;
  const withVolume = rows.filter((r) => r.volumeToCbm !== null);
  if (withVolume.length) return withVolume.find((r) => cbm <= r.volumeToCbm!)?.weightToKg ?? Number.POSITIVE_INFINITY;
  return kgPerCbm ? roundCents(cbm * kgPerCbm) : 0;
}

/** The price table for the customer's country; -1 when the tariff has none. */
export const matrixFor = (layout: CollectionLayout, country: string) => layout.matrices.findIndex((m) => m.country === country);

/** The zone column of a table for a distance (the first that reaches it) or a zone code; -1 when none. */
export function zoneFor(layout: CollectionLayout, matrix: number, at: { km: number } | { zone: string }): number {
  const zones = layout.matrices[matrix]?.zones ?? [];
  if ("km" in at) return zones.findIndex((z) => z.kmTo !== null && at.km <= z.kmTo);
  return zones.findIndex((z) => z.zone === at.zone);
}

/** The price of a consignment in a table's zone, with the surcharges that apply to it. */
export function priceIn(
  layout: CollectionLayout,
  rates: PricingRow[],
  matrix: number,
  zone: number,
  consignment: CollectionConsignment,
  distanceKm: number | null,
): Pricing {
  const rows = rates.filter((r) => r.matrix === matrix).sort((a, b) => a.weightToKg - b.weightToKg);
  const real = consignment.weightKg ?? 0;
  if (real <= 0 && !(consignment.cbm && consignment.cbm > 0)) return { ok: false, reason: "no_weight" };
  const byVolume = volumeKg(rows, layout.kgPerCbm, consignment.cbm ?? 0);
  if (byVolume === Number.POSITIVE_INFINITY) return { ok: false, reason: "too_big" };
  const chargeableKg = Math.max(real, byVolume);
  // A volume alone prices nothing on a tariff that does not count volume as weight: not the lightest row.
  if (chargeableKg <= 0) return { ok: false, reason: "no_weight" };
  const row = rows.find((r) => chargeableKg <= r.weightToKg);
  if (!row) return { ok: false, reason: "too_heavy", chargeableKg, maxKg: rows[rows.length - 1]?.weightToKg };
  const price = row.prices[zone];
  if (price === null || price === undefined) return { ok: false, reason: "no_price", chargeableKg };

  // A % of a table priced in whole units (TOPTRANS: whole CZK) is rounded the same way, as the
  // tariff's own calculator does; otherwise to cents.
  const whole = rows.every((r) => r.prices.every((p) => p === null || Number.isInteger(p)));
  const share = (percent: number | null) => (whole ? Math.round : roundCents)((price * (percent ?? 0)) / 100);
  const surcharges: CollectionSurchargeLine[] = [];
  for (const s of layout.surcharges) {
    if (s.kind === "oversize" && consignment.longestCm !== null && s.overLengthCm !== null && consignment.longestCm > s.overLengthCm) {
      surcharges.push({ label: s.label, amount: share(s.percent) });
    } else if (s.kind === "percent") {
      surcharges.push({ label: s.label, amount: share(s.percent) });
    } else if (s.kind === "flat") {
      surcharges.push({ label: s.label, amount: roundCents(s.amount ?? 0) });
    }
  }
  const m = layout.matrices[matrix]!;
  return {
    ok: true,
    matrixLabel: m.label,
    distanceKm,
    zoneLabel: m.zones[zone]!.label,
    chargeableKg,
    chargeableBy: byVolume > real ? "volume" : "weight",
    bandLabel: bandLabel(row.weightToKg),
    price,
    surcharges,
    total: roundCents(price + surcharges.reduce((sum, s) => sum + s.amount, 0)),
    currency: layout.currency,
  };
}
