import type { interfaces } from "@/lib/api/client";
import { openInvoiceRowIds } from "./openInvoices";

/** A quantity left empty counts as 1, as on the invoice (API invoiceCalc qtyOrOne). */
const qtyOrOne = (v: string | null | undefined) => {
  if (v === null || v === undefined || v.trim() === "") return 1;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Whether a selling line has a value (amount × quantity), as the invoice requires: one without is never invoiced. */
export const hasLineValue = (r: Pick<interfaces.SellingCostItem, "qty" | "amount">) => !!(Number(r.amount ?? 0) * qtyOrOne(r.qty));

/**
 * How many of a job's selling lines are on an open (issued, not credited) invoice, of all of
 * them. A line with no value is left out, as it is never invoiced. The same count as the queue's
 * Lines Invoiced column (API lib/billingQueue countInvoicedLines).
 */
export function invoicedLineCount(
  sellingCosts: readonly Pick<interfaces.SellingCostItem, "id" | "qty" | "amount">[],
  docs: readonly Pick<interfaces.InvoiceDocItem, "kind" | "status" | "lines">[],
): { invoiced: number; total: number } {
  const onOpenInvoice = openInvoiceRowIds(docs);
  const lines = sellingCosts.filter(hasLineValue);
  return { invoiced: lines.filter((r) => onOpenInvoice.has(r.id)).length, total: lines.length };
}
