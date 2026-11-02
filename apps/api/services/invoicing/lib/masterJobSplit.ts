import { splitCents } from "./costSplit";
import type { MasterJobSplitMethod } from "../schemas/masterJobCost.schema";

// How a master job's buying lines are shared out over its shipments. Pure, so the split has its test.

/** A shipment of the master job and its freight tons (W/M: the greater of tons and cbm). */
export interface SplitHouse {
  shipmentId: string;
  jobNumber: string;
  freightTon: number;
}

export interface SplitLineInput {
  splitMethod: MasterJobSplitMethod;
  estQty: string | null;
  estAmount: string | null;
  realQty: string | null;
  realAmount: string | null;
}

/** One shipment's part of a line: the estimated and the real total, or null where the line has none. */
export interface SplitShare {
  shipmentId: string;
  est: string | null;
  real: string | null;
}

/** The ref a shipment's row of a master job's line carries: "master:<masterJobId>:<lineId>". */
export const masterJobRef = (masterJobId: string, lineId: string) => `master:${masterJobId}:${lineId}`;
export const masterJobRefPrefix = (masterJobId: string) => `master:${masterJobId}:`;

/** The master job a split row's ref names, or null for any other ref. */
export function masterJobIdOfRef(ref: string | null | undefined): string | null {
  const m = /^master:([0-9a-f-]{36}):/i.exec(ref ?? "");
  return m ? m[1]! : null;
}

/** A line's total: its amount times its quantity (no quantity counts as 1), in cents; null when it has no amount. */
export function lineTotalCents(amount: string | null, qty: string | null): number | null {
  if (amount == null || amount.trim() === "") return null;
  const a = Number(amount);
  if (!Number.isFinite(a)) return null;
  const q = qty == null || qty.trim() === "" ? 1 : Number(qty);
  return Math.round(a * (Number.isFinite(q) ? q : 1) * 100);
}

/** What each shipment weighs in a line's split: its freight tons, or 1 each for "per shipment". */
export function splitWeights(method: MasterJobSplitMethod, houses: SplitHouse[]): number[] {
  return houses.map((h) => (method === "shipment" ? 1 : Math.max(0, Number.isFinite(h.freightTon) ? h.freightTon : 0)));
}

/**
 * Each shipment's part of a line, adding up to the line's total to the cent. A shipment that
 * weighs nothing (W/M 0 under a W/M split) gets no part; with nothing to split by - no shipments,
 * or none with a W/M - nobody does.
 */
export function splitLine(line: SplitLineInput, houses: SplitHouse[]): SplitShare[] {
  const weights = splitWeights(line.splitMethod, houses);
  if (!weights.some((w) => w > 0)) return [];
  const parts = (cents: number | null) => (cents == null ? null : splitCents(cents, weights));
  const est = parts(lineTotalCents(line.estAmount, line.estQty));
  const real = parts(lineTotalCents(line.realAmount, line.realQty));
  return houses.flatMap((h, i) =>
    weights[i]! > 0
      ? [{ shipmentId: h.shipmentId, est: est ? (est[i]! / 100).toFixed(2) : null, real: real ? (real[i]! / 100).toFixed(2) : null }]
      : [],
  );
}
