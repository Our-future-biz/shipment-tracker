import { toChargeCode } from "@/lib/chargeCodes";
import type { ChargeBasis, CostLine } from "./types";

// A buying line and the selling line made from it (the markup question, "Copy buying → selling")
// share a pairId, so removing one can offer to remove the other.

/** A new id for a buying / selling pair. */
export function newPairId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `pair-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const itemOf = (line: CostLine) => line.chargeCode || toChargeCode(line.type);
const textOf = (line: CostLine) => (line.description ?? "").trim().toLowerCase();

/**
 * The index of the line on the other side that goes with `line`: the one sharing its pairId (none
 * when that one was removed alone); for lines from before pairs, the first unpaired one with the
 * same item and description - the item alone is no match ("Other" least of all). -1 when there is none.
 */
export function counterpartIndex(line: CostLine, others: readonly CostLine[]): number {
  if (line.pairId) return others.findIndex((o) => o.pairId === line.pairId);
  // A line paired with another one is not taken for a guess.
  return others.findIndex((o) => !o.pairId && itemOf(o) === itemOf(line) && textOf(o) === textOf(line));
}

/** Whether a buying line that just got its amount is offered to selling: not when selling has it already. */
export const offerToSelling = (line: CostLine, selling: readonly CostLine[]): boolean => counterpartIndex(line, selling) < 0;

export type LineSide = "buying" | "selling";
export interface LineRemoval {
  side: LineSide;
  index: number;
}

/** The removal of the line at `index` on `side` - and of its counterpart at `other` on the other side, when `both`. */
export function lineRemovals(side: LineSide, index: number, other: number, both: boolean): LineRemoval[] {
  const removals: LineRemoval[] = [{ side, index }];
  if (both) removals.push({ side: side === "buying" ? "selling" : "buying", index: other });
  return removals;
}

/** Copies of the buying lines for selling, each pair sharing an id (the buying lines get theirs). */
export function pairedCopies(buying: readonly CostLine[]): { buying: CostLine[]; selling: CostLine[] } {
  const withIds = buying.map((l) => (l.pairId ? l : { ...l, pairId: newPairId() }));
  return { buying: withIds, selling: withIds.map((l) => ({ ...l, supplier: undefined })) };
}

/** The basis a selling line is charged by: its buying line's, when it has one (lumpsum when that has none). */
export function buyingBasis(line: CostLine, buying: readonly CostLine[]): ChargeBasis | undefined {
  const i = counterpartIndex(line, buying);
  return i < 0 ? undefined : (buying[i]!.basis ?? "lumpsum");
}

/** The selling lines with the basis of their buying lines; null when every one has it already. */
export function withBuyingBasis(buying: readonly CostLine[] | undefined, selling: readonly CostLine[] | undefined): CostLine[] | null {
  let changed = false;
  const lines = (selling ?? []).map((l) => {
    const basis = buyingBasis(l, buying ?? []);
    if (basis === undefined || basis === (l.basis ?? "lumpsum")) return l;
    changed = true;
    return { ...l, basis };
  });
  return changed ? lines : null;
}
