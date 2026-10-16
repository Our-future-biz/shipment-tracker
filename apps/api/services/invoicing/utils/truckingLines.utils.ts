// The rows a Trucking push writes into Costs Breakdown, and whether its selling rows may be
// replaced. Trucking owns these rows as sets, one per sourceRef: "trucking:consignment:<id>" (what
// the customer pays, selling side), "trucking:trip:<id>" (what the haulier is paid, buying side),
// "trucking:trip:<id>:job:<shipmentId>" (a job's share of an LTL trip), "trucking:leg:<id>" (a
// partner's delivery), "trucking:internal:<consignmentId>" (what another department's job pays
// Trucking) and "trucking:exception:<id>" (a delivery exception charged to the customer).
// Pure, so the mapping and the issued-invoice rule have their tests.

import { APIError } from "encore.dev/api";
import { toChargeCode } from "../../../lib/chargeCodes";
import { qtyOrOne } from "../lib/invoiceCalc";
import type { TruckingCostLine, TruckingSellingDifference } from "../interfaces/interfaces";

const ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SOURCE_REF = new RegExp(`^trucking:((consignment|leg|internal|exception):${ID}|trip:${ID}(:job:${ID})?)$`);
const CURRENCY = /^[A-Z]{3}$/;
const MAX_LINES = 50;

/**
 * The charge codes that all mean "road transport" in Costs: a Trucking line of one of them and a
 * hand-posted or quote-imported line of another are the same cost counted twice.
 */
export const ROAD_CODES = ["road_freight", "freight", "pickup", "delivery"] as const;

/** The codes counted as the same cost as `code` (the road codes together; any other code alone). */
export function sameCostCodes(code: string): string[] {
  return (ROAD_CODES as readonly string[]).includes(code) ? [...ROAD_CODES] : [code];
}

/** A sourceRef as Trucking sends it; throws invalid_argument otherwise. */
export function checkSourceRef(sourceRef: string): string {
  const ref = (sourceRef ?? "").trim().toLowerCase();
  if (!SOURCE_REF.test(ref)) throw APIError.invalidArgument("sourceRef must be trucking:consignment|trip|leg|internal|exception:<id> (or trucking:trip:<id>:job:<id>)");
  return ref;
}

const money = (n: number, what: string): string => {
  if (typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) >= 1e12) throw APIError.invalidArgument(`${what} must be a number`);
  return (Math.round(n * 100) / 100).toFixed(2);
};

function checkLine(l: TruckingCostLine, n: number): TruckingCostLine {
  const currency = (l.currency ?? "").trim().toUpperCase();
  if (!CURRENCY.test(currency)) throw APIError.invalidArgument(`Line ${n}: the currency must be a 3-letter code`);
  money(l.qty, `Line ${n}: qty`);
  money(l.unitPrice, `Line ${n}: unit price`);
  if (l.realAmount !== undefined && l.realAmount !== null) money(l.realAmount, `Line ${n}: real amount`);
  const invoiceNumber = l.invoiceNumber === undefined || l.invoiceNumber === null ? undefined : String(l.invoiceNumber).trim().slice(0, 100);
  return { ...l, currency, invoiceNumber, description: (l.description ?? "").trim().slice(0, 500), unit: (l.unit ?? "").trim().slice(0, 20) };
}

/** The lines of one side, checked (at most 50). */
export function checkLines(lines: TruckingCostLine[] | undefined, side: string): TruckingCostLine[] {
  const list = Array.isArray(lines) ? lines : [];
  if (list.length > MAX_LINES) throw APIError.invalidArgument(`At most ${MAX_LINES} ${side} lines`);
  return list.map((l, i) => checkLine(l, i + 1));
}

/**
 * A buying row: the estimate (qty × unit price), the real cost still open in the same currency,
 * the haulier as vendor. A line pushed with its real amount (Trucking's internal line) has the
 * real side filled too, with its document number; received once it has one.
 */
export const truckingBuyingRow = (l: TruckingCostLine) => ({
  category: toChargeCode(l.chargeCode || "road_freight"),
  description: l.description,
  estQty: money(l.qty, "qty"),
  estAmount: money(l.unitPrice, "unit price"),
  estCurrency: l.currency,
  realQty: money(l.qty, "qty"),
  realCurrency: l.currency,
  unit: l.unit,
  vendor: (l.vendor ?? "").trim(),
  haulierId: l.haulierId ?? null,
  ...(l.realAmount !== undefined && l.realAmount !== null ? { realAmount: money(l.realAmount, "real amount") } : {}),
  ...(l.invoiceNumber ? { invoiceNumber: l.invoiceNumber, received: true } : {}),
});

/** A selling row, ticked for invoicing. */
export const truckingSellingRow = (l: TruckingCostLine, customer: string) => ({
  category: toChargeCode(l.chargeCode || "road_freight"),
  description: l.description,
  customer,
  qty: money(l.qty, "qty"),
  amount: money(l.unitPrice, "unit price"),
  currency: l.currency,
  invoice: true,
});

/**
 * Whether the selling rows of a sourceRef may be replaced: not when any of them is already on an
 * issued, not credited invoice - then all of them stay as they are (a replacement would bill the
 * job twice) and the push says so.
 */
export function sellingReplaceable(currentIds: string[], invoicedIds: Set<string>): { replace: boolean; kept: number } {
  const kept = currentIds.filter((id) => invoicedIds.has(id)).length;
  return kept ? { replace: false, kept: currentIds.length } : { replace: true, kept: 0 };
}

// ---- a price change after the invoice (decision 9) ---------------------------------------------

/** The label of a difference line when Trucking names none. */
export const DIFFERENCE_LABEL = "Price change after invoice";

/** The sourceRef of the n-th difference line of a set: "trucking:consignment:<id>:diff:<n>". */
export const differenceRef = (sourceRef: string, n: number) => `${sourceRef}:diff:${n}`;

/** The number the next difference line of a set gets: one more than any it ever had (deleted ones included). */
export function nextDifferenceNumber(sourceRef: string, refs: (string | null)[]): number {
  const prefix = `${sourceRef}:diff:`;
  let last = 0;
  for (const r of refs) if (r?.startsWith(prefix)) last = Math.max(last, Number(r.slice(prefix.length)) || 0);
  return last + 1;
}

const cents = (n: number) => Math.round(n * 100);

/**
 * What the job must still be billed when a set is kept because it is on an issued invoice: per
 * currency, the new lines (qty × unit price) less what the kept rows (and earlier difference lines)
 * already bill. Currencies whose difference is 0 are left out; negative = a credit is owed.
 */
type SellingValue = { qty?: string | null; amount?: string | null; currency?: string };

export function sellingDifference(kept: SellingValue[], next: SellingValue[]): { currency: string; amount: number }[] {
  const by = new Map<string, number>();
  const add = (rows: SellingValue[], sign: 1 | -1) => {
    for (const r of rows) {
      const currency = r.currency ?? "";
      by.set(currency, (by.get(currency) ?? 0) + sign * cents(qtyOrOne(r.qty) * Number(r.amount ?? 0)));
    }
  };
  add(next, 1);
  add(kept, -1);
  return [...by]
    .filter(([, c]) => c !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, c]) => ({ currency, amount: c / 100 }));
}

/** The live difference lines of a set as the push answers them (one per ref and currency). */
export function differencesOf(rows: { ref: string | null; qty: string | null; amount: string | null; currency: string }[], sourceRef: string): TruckingSellingDifference[] {
  const out = new Map<string, TruckingSellingDifference>();
  for (const r of rows) {
    if (!r.ref?.startsWith(`${sourceRef}:diff:`)) continue;
    const key = `${r.ref}|${r.currency}`;
    const amount = qtyOrOne(r.qty) * Number(r.amount ?? 0);
    const was = out.get(key);
    out.set(key, { sourceRef: r.ref, currency: r.currency, amount: Math.round(((was?.amount ?? 0) + amount) * 100) / 100 });
  }
  return [...out.values()];
}

/** The real side of a buying row (what a haulier invoice approval or the internal statement sets). */
export interface RealSide {
  realQty: string | null;
  realAmount: string | null;
  realCurrency: string;
  invoiceNumber: string;
  received: boolean;
}

/** A buying row of the sourceRef as it is now. */
export interface CurrentBuyingRow extends RealSide {
  id: string;
  description: string;
}

/** Whether a row's real cost was entered (an amount, a document number or received). */
export const hasRealSide = (r: RealSide): boolean => r.realAmount !== null || r.invoiceNumber !== "" || r.received;

/**
 * How a re-push replaces a sourceRef's buying rows without losing their real side: each new row
 * takes the real side of the current row with the same description, else of the row at the same
 * position (a new row that brings its own real amount keeps it). A current row with a real side
 * that no new row takes over is kept (`keep`), never deleted; the rest are replaced. When new rows
 * come, they carry the estimate: a kept row's estimate is cleared (`clearEstimate`) so the job's
 * estimate is not counted twice - its real side stays.
 */
export function planBuyingReplace<T extends { description?: string; realAmount?: string | null }>(
  current: CurrentBuyingRow[],
  next: T[],
): { rows: (T & Partial<RealSide>)[]; keep: string[]; clearEstimate: string[] } {
  const taken = new Set<string>();
  const rows = next.map((row, i) => {
    const match = current.find((c) => !taken.has(c.id) && c.description === row.description) ?? (current[i] && !taken.has(current[i]!.id) ? current[i] : undefined);
    if (!match) return row;
    taken.add(match.id);
    if (!hasRealSide(match) || row.realAmount !== undefined) return row;
    const { realQty, realAmount, realCurrency, invoiceNumber, received } = match;
    return { ...row, realQty, realAmount, realCurrency, invoiceNumber, received };
  });
  const keep = current.filter((c) => !taken.has(c.id) && hasRealSide(c)).map((c) => c.id);
  return { rows, keep, clearEstimate: rows.length ? keep : [] };
}

/** A real line as Trucking sends it, optionally naming the row it is for. */
export interface RealLineIn {
  description?: string;
  amount: number;
  currency: string;
  invoiceNumber: string;
}

/** A live buying row of the sourceRef, in sort order, as the real push matches it. */
export interface RealRowIn {
  id: string;
  description: string;
  realAmount: string | null;
  invoiceNumber: string;
}

/**
 * Which row each real line goes to (C: a re-push may have kept rows): by description first, then
 * by position among the rows left - rows without a real side of another invoice first. More lines
 * than rows: the extra amounts go onto the last row matched in their currency. Rows left over
 * that carry a real side of the same invoice are cleared (it moved); other rows are not touched.
 * No lines: every row is cleared. Null when the lines cannot all be placed (no row, or no row in
 * an extra line's currency).
 */
export function matchRealLines(rows: RealRowIn[], lines: RealLineIn[]): { set: Map<string, RealLineIn>; clear: string[] } | null {
  if (!lines.length) return { set: new Map(), clear: rows.map((r) => r.id) };
  if (!rows.length) return null;
  const set = new Map<string, RealLineIn>();
  const free = (r: RealRowIn) => !set.has(r.id);
  const left: RealLineIn[] = [];
  for (const line of lines) {
    const row = line.description !== undefined ? rows.find((r) => free(r) && r.description === line.description) : undefined;
    if (row) set.set(row.id, line);
    else left.push(line);
  }
  const invoices = new Set(lines.map((l) => l.invoiceNumber));
  const otherInvoice = (r: RealRowIn) => r.realAmount !== null && r.invoiceNumber !== "" && !invoices.has(r.invoiceNumber);
  const order = [...rows.filter((r) => free(r) && !otherInvoice(r)), ...rows.filter((r) => free(r) && otherInvoice(r))];
  for (const [i, line] of left.entries()) {
    const row = order[i];
    if (row) {
      set.set(row.id, line);
      continue;
    }
    const last = [...set.entries()].reverse().find(([, l]) => l.currency === line.currency);
    if (!last) return null;
    set.set(last[0], { ...last[1], amount: Math.round((last[1].amount + line.amount) * 100) / 100 });
  }
  const clear = rows.filter((r) => !set.has(r.id) && r.realAmount !== null && invoices.has(r.invoiceNumber)).map((r) => r.id);
  return { set, clear };
}
