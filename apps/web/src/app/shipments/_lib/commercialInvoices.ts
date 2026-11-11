import type { interfaces } from "@/lib/api/client";
import { notAnAmount } from "@/components/costFields";
import { normaliseAmount, parseMoney } from "@/lib/money";

// The commercial invoices of a shipment (number, value, currency), as their dialog adds them up
// and saves them. A value is an amount as the cost fields read one: "12,500.00" and "12 500,00" are
// twelve thousand five hundred, never 12.50.

type CommercialInvoiceLine = interfaces.CommercialInvoiceLine;

export const isEmptyInvoiceLine = (l: CommercialInvoiceLine) => !l.invoiceNumber.trim() && !l.value.trim() && !l.currency;

/** "12,500.00 USD · 3,000.00 EUR" — one figure per currency; a value without one stands alone. A value that is no amount counts nothing. */
export function invoiceTotalsByCurrency(lines: CommercialInvoiceLine[]): string {
  const by = new Map<string, number>();
  for (const l of lines) {
    const v = parseMoney(l.value) ?? 0;
    if (v) by.set(l.currency, (by.get(l.currency) ?? 0) + v);
  }
  return [...by.entries()]
    .map(([c, v]) => `${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`.trim())
    .join(" · ");
}

/**
 * The lines to save: the empty ones left out, each value written as the API keeps amounts
 * ("12,500.00" -> "12500"). A value that is no amount is not saved: the answer is why, instead.
 */
export function invoiceLinesToSave(lines: CommercialInvoiceLine[]): { lines: CommercialInvoiceLine[] } | { error: string } {
  const out: CommercialInvoiceLine[] = [];
  for (const line of lines) {
    if (isEmptyInvoiceLine(line)) continue;
    const value = normaliseAmount(line.value);
    if (value === null) return { error: notAnAmount(line.value.trim()) };
    out.push({ ...line, value });
  }
  return { lines: out };
}
