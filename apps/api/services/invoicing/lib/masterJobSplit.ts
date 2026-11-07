import { splitCents } from "./costSplit";
import type { InvoiceCostRecord, NewInvoiceCostRecord } from "../schemas/invoiceCost.schema";
import type { MasterJobSplitMethod } from "../schemas/masterJobCost.schema";

// How a master job's buying lines are shared out over its shipments. Pure, so the split has its test.

/** A shipment's share of a line, as written into its Costs Breakdown. */
export type SplitRowValues = Pick<
  NewInvoiceCostRecord,
  "shipmentId" | "category" | "description" | "vendor" | "estAmount" | "estCurrency" | "realAmount" | "realCurrency" | "invoiceNumber" | "received" | "sourceMasterJobRef"
> & { lineSort: number };

// Split rows go after a shipment's own lines.
export const SPLIT_SORT_BASE = 100_000;

// The columns a split row takes from its line.
export const SPLIT_FIELDS = [
  "category", "description", "vendor", "estAmount", "estCurrency", "realAmount", "realCurrency", "invoiceNumber", "received", "sortOrder",
] as const;

/** The columns a share is written with: its line's, and its place after the shipment's own lines. */
export function splitRowColumns({ lineSort, ...row }: SplitRowValues) {
  return { ...row, sortOrder: SPLIT_SORT_BASE + lineSort };
}

/** Whether a row in a shipment's Costs Breakdown already says what its share would write. */
export function splitRowUnchanged(written: Pick<InvoiceCostRecord, (typeof SPLIT_FIELDS)[number]>, row: SplitRowValues): boolean {
  const values = splitRowColumns(row);
  return SPLIT_FIELDS.every((f) => (written[f] ?? null) === (values[f] ?? null));
}

/** Whether the shipments carry exactly these shares: one row each, saying the same, and no others. */
export function splitRowsInSync(
  written: (Pick<InvoiceCostRecord, "shipmentId" | "sourceMasterJobRef" | (typeof SPLIT_FIELDS)[number]>)[],
  rows: SplitRowValues[],
): boolean {
  if (written.length !== rows.length) return false;
  const byKey = new Map(written.map((r) => [`${r.shipmentId} ${r.sourceMasterJobRef}`, r]));
  return rows.every((row) => {
    const current = byKey.get(`${row.shipmentId} ${row.sourceMasterJobRef}`);
    return !!current && splitRowUnchanged(current, row);
  });
}

// The costs a shipment sells on at what they cost: a share of one gets a selling row of the same amount.
const SOLD_AT_COST = new Set(["container_demurrage"]);

/** A selling row a share of a sold-at-cost line calls for. */
export interface SoldAtCostRow {
  shipmentId: string;
  category: string;
  description: string;
  amount: string;
  currency: string;
  sourceMasterJobRef: string;
}

/** A selling row the split keeps, as it is now. */
export type CurrentSoldAtCostRow = Omit<SoldAtCostRow, "amount" | "sourceMasterJobRef"> & {
  id: string;
  amount: string | null;
  sourceMasterJobRef: string | null;
  /** A number of its own: what the share cost when it was set. Absent or null = it follows the cost. */
  amountOverrideCost?: string | null;
};

/**
 * Whether a row keeps its own number at this cost. A number at or above the cost stays (a margin
 * someone set). One below it stays only at the very cost it was approved for: an approval for one
 * cost doesn't cover another, so the row goes back to the cost.
 */
export function keepsOwnAmount(row: CurrentSoldAtCostRow, wanted: SoldAtCostRow): boolean {
  if (row.amountOverrideCost == null || row.currency !== wanted.currency) return false;
  return row.amountOverrideCost === wanted.amount || Number(row.amount ?? 0) >= Number(wanted.amount);
}

const soldAtCostKey = (row: { shipmentId: string; sourceMasterJobRef: string | null }) => `${row.shipmentId} ${row.sourceMasterJobRef}`;

/** The selling rows these shares call for: the same amount as the share, its real cost or else its estimate. */
export function soldAtCostRows(rows: SplitRowValues[]): SoldAtCostRow[] {
  return rows.flatMap((row) => {
    if (!SOLD_AT_COST.has(row.category ?? "") || !row.sourceMasterJobRef) return [];
    const real = row.realAmount != null;
    const amount = real ? row.realAmount : row.estAmount;
    if (amount == null) return [];
    return [{
      shipmentId: row.shipmentId,
      category: row.category!,
      description: row.description ?? "",
      amount,
      currency: (real ? row.realCurrency : row.estCurrency) ?? "CZK",
      sourceMasterJobRef: row.sourceMasterJobRef,
    }];
  });
}

export interface SoldAtCostPlan {
  add: SoldAtCostRow[];
  /** keepAmount: the row's own number stays, and only what else it takes from its line is written. */
  change: { id: string; row: SoldAtCostRow; keepAmount: boolean }[];
  remove: string[];
  /** Rows that differ from the split, or have left it, but stay: they are on an issued invoice. */
  onInvoices: number;
}

/**
 * What to write so the shipments sell on what the split says. A row on an issued invoice is part of
 * a tax document and stays as it is. A share in `noRowFor` (by shipment and ref) gets no row: someone
 * already copied it with Copy from buying, so it would bill twice, or a manager approved taking it off.
 */
export function planSoldAtCost(current: CurrentSoldAtCostRow[], wanted: SoldAtCostRow[], invoiced: Set<string>, noRowFor: Set<string> = new Set()): SoldAtCostPlan {
  const plan: SoldAtCostPlan = { add: [], change: [], remove: [], onInvoices: 0 };
  const byKey = new Map(current.map((r) => [soldAtCostKey(r), r]));
  const wantedKeys = new Set(wanted.map(soldAtCostKey));
  for (const row of wanted) {
    const existing = byKey.get(soldAtCostKey(row));
    if (!existing) {
      if (!noRowFor.has(soldAtCostKey(row))) plan.add.push(row);
      continue;
    }
    const keepAmount = keepsOwnAmount(existing, row);
    const same = (keepAmount || existing.amount === row.amount) && existing.currency === row.currency && existing.category === row.category && existing.description === row.description;
    if (same) continue;
    if (invoiced.has(existing.id)) plan.onInvoices += 1;
    else plan.change.push({ id: existing.id, row, keepAmount });
  }
  const seen = new Set<string>();
  for (const row of current) {
    const key = soldAtCostKey(row);
    // A second row of one share (none should exist) goes the way of a row that left the split.
    if (wantedKeys.has(key) && !seen.has(key) && byKey.get(key)?.id === row.id) {
      seen.add(key);
      continue;
    }
    if (invoiced.has(row.id)) plan.onInvoices += 1;
    else plan.remove.push(row.id);
  }
  return plan;
}

/**
 * The shares a manager approved taking off the selling, by shipment and ref: only at the very cost
 * approved. An approval for one cost doesn't cover another, so at a new cost the row comes back.
 */
export function waivedShares(waived: { shipmentId: string; sourceMasterJobRef: string | null; amountOverrideCost: string | null }[], wanted: SoldAtCostRow[]): Set<string> {
  const approvedAt = new Set(waived.map((w) => `${soldAtCostKey(w)} ${w.amountOverrideCost}`));
  return new Set(wanted.filter((w) => approvedAt.has(`${soldAtCostKey(w)} ${w.amount}`)).map(soldAtCostKey));
}

/** Whether the plan writes nothing. */
export const soldAtCostInSync = (plan: SoldAtCostPlan) => plan.add.length === 0 && plan.change.length === 0 && plan.remove.length === 0;

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
  /** False: the line is not shared out, so no shipment carries a part (none given counts as in). */
  inSplit?: boolean;
  /** The shipments taken out of this line's split. */
  excludedShipmentIds?: string[];
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

/** The shipments a line is shared out over: the master job's, without those taken out of its split. */
export function housesInSplit(line: Pick<SplitLineInput, "excludedShipmentIds">, houses: SplitHouse[]): SplitHouse[] {
  const out = new Set(line.excludedShipmentIds ?? []);
  return houses.filter((h) => !out.has(h.shipmentId));
}

/**
 * Each shipment's part of a line, adding up to the line's total to the cent. A shipment taken out
 * of the line's split, or that weighs nothing (W/M 0 under a W/M split), gets no part; with nothing
 * to split by - a line not in the split, no shipments, or none with a W/M - nobody does.
 */
export function splitLine(line: SplitLineInput, houses: SplitHouse[]): SplitShare[] {
  if (line.inSplit === false) return [];
  const inSplit = housesInSplit(line, houses);
  const weights = splitWeights(line.splitMethod, inSplit);
  if (!weights.some((w) => w > 0)) return [];
  const parts = (cents: number | null) => (cents == null ? null : splitCents(cents, weights));
  const est = parts(lineTotalCents(line.estAmount, line.estQty));
  const real = parts(lineTotalCents(line.realAmount, line.realQty));
  return inSplit.flatMap((h, i) =>
    weights[i]! > 0
      ? [{ shipmentId: h.shipmentId, est: est ? (est[i]! / 100).toFixed(2) : null, real: real ? (real[i]! / 100).toFixed(2) : null }]
      : [],
  );
}
