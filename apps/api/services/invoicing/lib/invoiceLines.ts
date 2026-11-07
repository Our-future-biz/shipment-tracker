import { toChargeCode } from "../../../lib/chargeCodes";
import { splitCents } from "./costSplit";

// An invoice read line by line: a line whose B/L names a shipment goes to that shipment, any other
// is shared out over the shipments given, and each shipment gets one buying row per charge and
// currency. Pure, so the sums have their test.

export interface InvoicePostLine {
  category: string;
  /** a decimal string; a credit is negative */
  amount: string;
  currency: string;
  /** the charge as the invoice prints it */
  item?: string;
  /** the shipment its B/L names, or the one a person chose */
  shipmentId?: string;
  /** otherwise: the shipments it is shared out over, by weight */
  split?: { shipmentId: string; weight: number }[];
}

/** One buying row an invoice comes to. */
export interface InvoicePostRow {
  shipmentId: string;
  category: string;
  /** "399.60" */
  amount: string;
  currency: string;
  description: string;
}

/** Why this line can't be posted, or null. */
export function invoiceLineProblem(line: InvoicePostLine): string | null {
  const cents = Math.round(Number(line.amount) * 100);
  const label = line.item?.trim() || line.category || "A line";
  if (!line.amount.trim() || !Number.isFinite(cents) || cents === 0) return `${label}: the amount must be a number other than 0`;
  if (!toChargeCode(line.category)) return `${label}: choose a charge`;
  if (!line.currency.trim()) return `${label}: the currency is missing`;
  if (line.shipmentId) return null;
  const weights = (line.split ?? []).map((s) => s.weight);
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) return `${label}: a weight must be a number of at least 0`;
  return weights.some((w) => w > 0) ? null : `${label}: no shipment to split it over`;
}

/** Why these lines are no credit note, or null: a credit note deducts, so no currency may come to more than 0. */
export function creditNoteProblem(lines: InvoicePostLine[]): string | null {
  const totals = new Map<string, number>();
  for (const line of lines) {
    const currency = line.currency.trim().toUpperCase();
    totals.set(currency, (totals.get(currency) ?? 0) + Math.round(Number(line.amount) * 100));
  }
  return [...totals.values()].some((cents) => cents >= 0) ? "A credit note deducts: its amounts must come to less than 0" : null;
}

/** A buying row's description on a credit note, which the row must say as well as its minus. */
function creditDescription(items: string[]): string {
  const text = items.join(", ");
  if (!text) return "Credit note";
  return /^credit note/i.test(text) ? text : `Credit note: ${text}`;
}

/**
 * The rows the lines come to, in the order the shipments and charges first appear. A shared line
 * adds up to its amount to the cent; a row that comes to nothing (a charge and its credit) is left out.
 */
export function invoiceRows(lines: InvoicePostLine[], opts: { creditNote?: boolean } = {}): InvoicePostRow[] {
  const rows = new Map<string, { shipmentId: string; category: string; cents: number; currency: string; items: string[] }>();
  const add = (shipmentId: string, line: InvoicePostLine, cents: number) => {
    if (cents === 0) return;
    const category = toChargeCode(line.category);
    const currency = line.currency.trim().toUpperCase();
    const key = `${shipmentId} ${category} ${currency}`;
    const row = rows.get(key) ?? { shipmentId, category, cents: 0, currency, items: [] };
    row.cents += cents;
    const item = line.item?.trim();
    if (item && !row.items.includes(item)) row.items.push(item);
    rows.set(key, row);
  };
  for (const line of lines) {
    const cents = Math.round(Number(line.amount) * 100);
    if (line.shipmentId) {
      add(line.shipmentId, line, cents);
      continue;
    }
    const split = line.split ?? [];
    const parts = splitCents(cents, split.map((s) => s.weight));
    split.forEach((s, i) => add(s.shipmentId, line, parts[i]!));
  }
  return [...rows.values()]
    .filter((r) => r.cents !== 0)
    .map((r) => ({ shipmentId: r.shipmentId, category: r.category, amount: (r.cents / 100).toFixed(2), currency: r.currency, description: opts.creditNote ? creditDescription(r.items) : r.items.join(", ") }));
}
