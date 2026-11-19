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

/**
 * The queue's Lines Invoiced cell: "invoiced/all" of the job's charges, and whether the job owes its customer a credit
 * (M3: a line below nothing on no open invoice - not counted among the charges, so a job can read 2/2 and still owe
 * one; the check "Invoiced, charges or credits open" lists it). Null when there is neither.
 */
export function linesInvoicedCell(
  r: Pick<interfaces.BillingQueueItem, "sellingLines" | "invoicedLines"> & { creditsOwed?: number },
): { count: string; done: boolean; creditOwed: boolean; title: string } | null {
  const owed = r.creditsOwed ?? 0;
  if (!r.sellingLines && !owed) return null;
  const parts = [
    r.sellingLines ? `${r.invoicedLines} of ${r.sellingLines} selling lines invoiced` : "",
    owed ? `${owed === 1 ? "a credit" : `${owed} credits`} owed to the customer - give it on a credit note` : "",
  ].filter(Boolean);
  return {
    count: r.sellingLines ? `${r.invoicedLines}/${r.sellingLines}` : "",
    done: r.invoicedLines === r.sellingLines,
    creditOwed: owed > 0,
    title: parts.join("; "),
  };
}
