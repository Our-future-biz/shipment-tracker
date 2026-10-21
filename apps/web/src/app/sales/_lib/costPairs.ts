import { toChargeCode } from "@/lib/chargeCodes";
import type { CostLine } from "./types";

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
 * same item and description, else with the same item. -1 when there is none.
 */
export function counterpartIndex(line: CostLine, others: readonly CostLine[]): number {
  if (line.pairId) return others.findIndex((o) => o.pairId === line.pairId);
  // A line paired with another one is not taken for a guess.
  const sameItem = (o: CostLine) => !o.pairId && itemOf(o) === itemOf(line);
  const exact = others.findIndex((o) => sameItem(o) && textOf(o) === textOf(line));
  return exact >= 0 ? exact : others.findIndex(sameItem);
}

/** Copies of the buying lines for selling, each pair sharing an id (the buying lines get theirs). */
export function pairedCopies(buying: readonly CostLine[]): { buying: CostLine[]; selling: CostLine[] } {
  const withIds = buying.map((l) => (l.pairId ? l : { ...l, pairId: newPairId() }));
  return { buying: withIds, selling: withIds.map((l) => ({ ...l, supplier: undefined })) };
}
