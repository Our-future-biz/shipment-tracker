// The real side of the Trucking buying rows (Phase 6 B): when a haulier invoice is approved,
// Trucking sends the real cost of each row of a sourceRef, in the rows' order - the estimate's
// split, worked out by Trucking. Pure, so the checks and the row values have their tests.

import { APIError } from "encore.dev/api";
import type { TruckingRealLine } from "../interfaces/interfaces";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
// A trip (FTL), one job's share of an LTL trip, or a partner's delivery leg.
const REAL_SOURCE_REF = new RegExp(`^trucking:(trip:${UUID}(:job:${UUID})?|leg:${UUID})$`);
const CURRENCY = /^[A-Z]{3}$/;
const MAX_LINES = 50;

/** A sourceRef of Trucking buying rows; throws invalid_argument otherwise. */
export function checkRealSourceRef(sourceRef: string): string {
  const ref = (sourceRef ?? "").trim().toLowerCase();
  if (!REAL_SOURCE_REF.test(ref)) throw APIError.invalidArgument("sourceRef must be trucking:trip:<id>, trucking:trip:<id>:job:<shipmentId> or trucking:leg:<id>");
  return ref;
}

/** The real lines, checked (at most 50). */
export function checkRealLines(lines: TruckingRealLine[] | undefined): TruckingRealLine[] {
  const list = Array.isArray(lines) ? lines : [];
  if (list.length > MAX_LINES) throw APIError.invalidArgument(`At most ${MAX_LINES} real lines`);
  return list.map((l, i) => {
    const n = i + 1;
    if (typeof l?.amount !== "number" || !Number.isFinite(l.amount) || Math.abs(l.amount) >= 1e12) throw APIError.invalidArgument(`Line ${n}: the amount must be a number`);
    const currency = (l.currency ?? "").trim().toUpperCase();
    if (!CURRENCY.test(currency)) throw APIError.invalidArgument(`Line ${n}: the currency must be a 3-letter code`);
    const invoiceNumber = (l.invoiceNumber ?? "").trim();
    if (!invoiceNumber || invoiceNumber.length > 100) throw APIError.invalidArgument(`Line ${n}: the invoice number is required (at most 100 characters)`);
    const description = typeof l.description === "string" ? l.description.trim().slice(0, 500) : undefined;
    return { ...(description !== undefined ? { description } : {}), amount: Math.round(l.amount * 100) / 100, currency, invoiceNumber };
  });
}

/**
 * The real side of a row: the whole amount as one (qty 1), the haulier's invoice number, the
 * invoice received. `null` clears it (qty back to the estimate's, nothing received).
 */
export function realRowValues(line: TruckingRealLine | null, estQty: string | null) {
  if (!line) return { realQty: estQty, realAmount: null, invoiceNumber: "", received: false };
  return { realQty: "1.00", realAmount: line.amount.toFixed(2), realCurrency: line.currency, invoiceNumber: line.invoiceNumber, received: true };
}
