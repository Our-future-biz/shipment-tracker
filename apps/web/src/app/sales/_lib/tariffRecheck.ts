import { containerType } from "@/lib/cargo";
import { isCollectionLine } from "./collectionQuote";
import { isOceanLine } from "./oceanQuote";
import { isRailLine } from "./railQuote";
import { tradeDirectionOf } from "./tariffQuote";
import { computeCargo, isContainerQuote } from "./salesQuote";
import type { CostLine, SalesQuoteData } from "./types";

// A buying line priced from a tariff that prices by weight - rail (each container's cargo weight)
// and collections (the shipment's gross weight) - remembers the cargo weight it was priced for
// (pricedFor). When the weight in Cargo details changes afterwards, Pricing marks the line and asks
// for the rate to be checked again, until the tariff is picked again, the rate is changed by hand,
// or the user says it still holds. Ocean tariffs price by container type, not weight: their lines
// are not marked.

/** The cargo weight a tariff priced by: each container type's cargo weight per box on a full-container quote, else the gross weight. */
export function cargoWeightKey(data: SalesQuoteData): string {
  if (isContainerQuote(data)) {
    const boxes = new Set((data.containers ?? []).filter((c) => (Number(c.qty) || 0) > 0).map((c) => `${containerType(c.type)} ${Number(c.weight) || 0} kg`));
    return [...boxes].sort().join(", ");
  }
  return `${computeCargo(data).grossWeight} kg`;
}

/** Whether a line's tariff prices by weight. */
export const pricedByWeight = (line: CostLine): boolean => isRailLine(line) || isCollectionLine(line);

/** The buying lines with those at `indexes` marked as priced for the cargo weight the quote has now. */
export function stampPricedFor(lines: CostLine[], indexes: Iterable<number>, data: SalesQuoteData): CostLine[] {
  const at = new Set(indexes);
  const key = cargoWeightKey(data);
  return lines.map((l, i) => (at.has(i) && pricedByWeight(l) ? { ...l, pricedFor: key } : l));
}

/** Whether a line was priced from a tariff that is for one direction or both: rail and ocean (collections have none). */
export const pricedByDirection = (line: CostLine): boolean => isRailLine(line) || isOceanLine(line);

/** The buying lines with those at `indexes` marked as priced in the quote's Trade Direction. */
export function stampDirection(lines: CostLine[], indexes: Iterable<number>, data: SalesQuoteData): CostLine[] {
  const at = new Set(indexes);
  const direction = tradeDirectionOf(data);
  if (!direction) return lines;
  return lines.map((l, i) => (at.has(i) && pricedByDirection(l) ? { ...l, pricedDirection: direction } : l));
}

/**
 * The indexes of the buying lines priced from a tariff in another Trade Direction than the quote has
 * now: an import tariff does not price an export, nor the other way round. Their tariff is picked again
 * (or the lines go) before the quote is sent. Lines priced before the direction was remembered are not known.
 */
export function linesForOtherDirection(data: SalesQuoteData): number[] {
  const direction = tradeDirectionOf(data);
  return (data.buyingLines ?? []).flatMap((l, i) =>
    pricedByDirection(l) && l.pricedDirection !== undefined && l.pricedDirection !== direction ? [i] : [],
  );
}

/** Why the quote can't be sent for its lines priced in another Trade Direction; null when none is. */
export function otherDirectionBlock(data: SalesQuoteData): string | null {
  const lines = linesForOtherDirection(data);
  if (!lines.length) return null;
  const was = data.buyingLines?.[lines[0]!]?.pricedDirection;
  return `${lines.length === 1 ? "A buying line was" : `${lines.length} buying lines were`} priced from ${was === "import" ? "an import" : "an export"} tariff, and the quote is ${
    tradeDirectionOf(data) ? `now an ${tradeDirectionOf(data)}` : "without a Trade Direction"
  } — pick the tariff again under Tariffs available, or remove the line${lines.length === 1 ? "" : "s"}`;
}

/** The indexes of the buying lines priced for another cargo weight than the quote has now. */
export function linesToRecheck(data: SalesQuoteData): number[] {
  const key = cargoWeightKey(data);
  return (data.buyingLines ?? []).flatMap((l, i) => (pricedByWeight(l) && l.pricedFor !== undefined && l.pricedFor !== key ? [i] : []));
}

/**
 * The buying lines after an edit, with a line to recheck whose rate was changed by hand marked as
 * priced for today's weight: whoever changed it has checked it. Null when none was.
 */
export function rechecked(before: readonly CostLine[], after: CostLine[], data: SalesQuoteData): CostLine[] | null {
  const key = cargoWeightKey(data);
  let changed = false;
  const lines = after.map((l, i) => {
    if (!pricedByWeight(l) || l.pricedFor === undefined || l.pricedFor === key) return l;
    // The same line before: at the same place while no line came or went, else by its pair.
    const was = before.length === after.length ? before[i] : before.find((b) => !!b.pairId && b.pairId === l.pairId);
    if (!was || (Number(was.amount) === Number(l.amount) && was.unitPrice === l.unitPrice)) return l;
    changed = true;
    return { ...l, pricedFor: key };
  });
  return changed ? lines : null;
}

/**
 * `patch` (what opening the quote puts right) with the rates priced by weight before the weight was
 * remembered taken as priced for the weight the quote has now, so a later change of it marks them.
 */
export function withPricedForNow(data: SalesQuoteData, patch: Partial<SalesQuoteData>): Partial<SalesQuoteData> {
  const lines = patch.buyingLines ?? data.buyingLines ?? [];
  const unknown = lines.flatMap((l, i) => (pricedByWeight(l) && l.pricedFor === undefined ? [i] : []));
  return unknown.length ? { ...patch, buyingLines: stampPricedFor(lines, unknown, { ...data, ...patch }) } : patch;
}
