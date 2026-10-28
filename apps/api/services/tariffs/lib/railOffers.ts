import { containerLengthFt, containerTareKg } from "../../../lib/containerTares";
import type { RailBand, RailOfferContainer, RailOfferLine, RailPricedContainer } from "../interfaces/interfaces";
import { bandCode } from "./railConvert";

// What a rail tariff row asks for a quote's containers: each container line is priced by the
// lightest weight band of its length that its gross weight (cargo + tare) fits and the row has a
// price for. Pure.

/**
 * The length a tariff prices a container by: a 45' as a 40' (METRANS General Conditions 3.15: 40'
 * high cubes and 45' boxes go for the 40' price). Open tops and flat racks need nothing: they go
 * for the price of their length (3.17).
 */
export const tariffLengthFt = (lengthFt: number | null): number | null => (lengthFt === 45 ? 40 : lengthFt);

/** The containers as the tariffs count them: tare added to the cargo, length as priced. */
export function pricedContainers(containers: RailOfferContainer[]): RailPricedContainer[] {
  return containers.map((c) => {
    const tareKg = containerTareKg(c.type);
    return {
      ...c,
      tareKg,
      grossKg: tareKg !== null && c.cargoKg !== null ? c.cargoKg + tareKg : null,
      lengthFt: tariffLengthFt(containerLengthFt(c.type)),
    };
  });
}

/** Why a row cannot price a container: no price for its length, or heavier than every band of it. */
export type BandRefusal = "length" | "heavy";

export type BandChoice = { ok: true; band: RailBand; code: string; price: number } | { ok: false; reason: BandRefusal };

const heaviest = (b: RailBand) => b.maxGrossTonnes ?? Number.POSITIVE_INFINITY;

/**
 * The band a container is priced by in a row: of the bands of its length that the row has a price
 * for, the lightest its gross weight fits. Without a known weight, the lightest of its length (the
 * offer then says the weight is missing). A container heavier than all of them is priced by the
 * operator case by case (METRANS General Conditions 3.40), so not here.
 */
export function bandFor(bands: RailBand[], prices: Record<string, number>, container: Pick<RailPricedContainer, "lengthFt" | "grossKg">): BandChoice {
  const length = container.lengthFt;
  if (length === null) return { ok: false, reason: "length" };
  const priced = bands
    .map((band) => ({ band, code: bandCode(band), price: prices[bandCode(band)] }))
    .filter((b): b is { band: RailBand; code: string; price: number } => b.band.minLengthFt <= length && length <= b.band.maxLengthFt && typeof b.price === "number");
  if (!priced.length) return { ok: false, reason: "length" };
  const gross = container.grossKg;
  const fitting = gross === null ? priced : priced.filter((b) => gross <= heaviest(b.band) * 1000);
  if (!fitting.length) return { ok: false, reason: "heavy" };
  const [best] = fitting.sort((a, b) => heaviest(a.band) - heaviest(b.band) || a.price - b.price);
  return { ok: true, ...best! };
}

export type RowOffer = { ok: true; lines: RailOfferLine[]; total: number } | { ok: false; container: number; reason: BandRefusal };

/** What a row asks for all the containers, or the first container it cannot price and why. */
export function rowOffer(bands: RailBand[], prices: Record<string, number>, containers: RailPricedContainer[]): RowOffer {
  const lines: RailOfferLine[] = [];
  for (const [i, c] of containers.entries()) {
    const choice = bandFor(bands, prices, c);
    if (!choice.ok) return { ok: false, container: i, reason: choice.reason };
    lines.push({ type: c.type, qty: c.qty, bandCode: choice.code, bandLabel: choice.band.label, price: choice.price, amount: roundCents(choice.price * c.qty) });
  }
  return { ok: true, lines, total: roundCents(lines.reduce((sum, l) => sum + l.amount, 0)) };
}

const roundCents = (n: number) => Math.round(n * 100) / 100;

/** What a typed place is looked for by: a 5-digit postcode in it ("602 00", "Brno 60200"), else its name. */
export function placeQuery(text: string): { postcode: string } | { name: string } | null {
  const clean = text.trim();
  if (!clean) return null;
  const postcode = /(?:^|\D)(\d{3}) ?(\d{2})(?!\d)/.exec(clean);
  if (postcode) return { postcode: `${postcode[1]}${postcode[2]}` };
  return { name: clean };
}
