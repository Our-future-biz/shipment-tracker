// The rows a Trucking push writes into Costs Breakdown, and whether its selling rows may be
// replaced. Trucking owns these rows as sets, one per sourceRef: "trucking:consignment:<id>" (what
// the customer pays, selling side), "trucking:trip:<id>" (what the haulier is paid, buying side),
// "trucking:trip:<id>:job:<shipmentId>" (a job's share of an LTL trip), "trucking:leg:<id>" (a
// partner's delivery), "trucking:internal:<consignmentId>" (what another department's job pays
// Trucking) and "trucking:exception:<id>" (a delivery exception charged to the customer).
// Pure, so the mapping and the issued-invoice rule have their tests.

import { APIError } from "encore.dev/api";
import { toChargeCode } from "../../../lib/chargeCodes";
import type { TruckingCostLine } from "../interfaces/interfaces";

const ID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SOURCE_REF = new RegExp(`^trucking:((consignment|leg|internal|exception):${ID}|trip:${ID}(:job:${ID})?)$`);
const CURRENCY = /^[A-Z]{3}$/;
const MAX_LINES = 50;

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
 * that no new row takes over is kept as it is (`keep`), never deleted; the rest are replaced.
 */
export function planBuyingReplace<T extends { description?: string; realAmount?: string | null }>(
  current: CurrentBuyingRow[],
  next: T[],
): { rows: (T & Partial<RealSide>)[]; keep: string[] } {
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
  return { rows, keep };
}
