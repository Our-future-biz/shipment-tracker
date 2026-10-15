// The rows a Trucking push writes into Costs Breakdown, and whether its selling rows may be
// replaced. Trucking owns these rows as sets, one per sourceRef: "trucking:consignment:<id>" (what
// the customer pays, selling side) and "trucking:trip:<id>" (what the haulier is paid, buying side).
// Pure, so the mapping and the issued-invoice rule have their tests.

import { APIError } from "encore.dev/api";
import { toChargeCode } from "../../../lib/chargeCodes";
import type { TruckingCostLine } from "../interfaces/interfaces";

const SOURCE_REF = /^trucking:(consignment|trip):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CURRENCY = /^[A-Z]{3}$/;
const MAX_LINES = 50;

/** A sourceRef as Trucking sends it; throws invalid_argument otherwise. */
export function checkSourceRef(sourceRef: string): string {
  const ref = (sourceRef ?? "").trim().toLowerCase();
  if (!SOURCE_REF.test(ref)) throw APIError.invalidArgument("sourceRef must be trucking:consignment:<id> or trucking:trip:<id>");
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
  return { ...l, currency, description: (l.description ?? "").trim().slice(0, 500), unit: (l.unit ?? "").trim().slice(0, 20) };
}

/** The lines of one side, checked (at most 50). */
export function checkLines(lines: TruckingCostLine[] | undefined, side: string): TruckingCostLine[] {
  const list = Array.isArray(lines) ? lines : [];
  if (list.length > MAX_LINES) throw APIError.invalidArgument(`At most ${MAX_LINES} ${side} lines`);
  return list.map((l, i) => checkLine(l, i + 1));
}

/** A buying row: the estimate (qty × unit price), the real cost still open in the same currency, the haulier as vendor. */
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
