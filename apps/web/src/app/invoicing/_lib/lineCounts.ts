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
 * them. The same count as the queue's Lines Invoiced column (API lib/billingQueue countInvoicedLines):
 * a line with no value is left out, as it is never invoiced; so is a line below nothing on no open
 * invoice (a credit owed, not a charge) and the row a partial credit note put on the job (user council
 * B19: 5 charges and that row read "5/6").
 */
export function invoicedLineCount(
  sellingCosts: readonly (Pick<interfaces.SellingCostItem, "id" | "qty" | "amount"> & { sourceCreditNoteId?: string | null })[],
  docs: readonly (Pick<interfaces.InvoiceDocItem, "kind" | "status" | "lines"> & Partial<Pick<interfaces.InvoiceDocItem, "id" | "correctsInvoiceId">>)[],
): { invoiced: number; total: number } {
  const onOpenInvoice = openInvoiceRowIds(docs);
  const lines = sellingCosts.filter(
    (r) => hasLineValue(r) && !r.sourceCreditNoteId && (onOpenInvoice.has(r.id) || Number(r.amount ?? 0) * qtyOrOne(r.qty) > 0),
  );
  return { invoiced: lines.filter((r) => onOpenInvoice.has(r.id)).length, total: lines.length };
}

/**
 * The queue's Lines Invoiced cell: "invoiced/all" of the job's charges, and whether the job owes its customer a credit
 * (M3: a line below nothing on no open invoice - not counted among the charges, so a job can read 2/2 and still owe
 * one; the check "Invoiced, charges or credits open" lists it). Null when there is neither. `notTicked`: "1 line not
 * ticked for Invoice" when charges on no invoice are not ticked (mock council S5-3: the job sat in To bill with 0 to
 * bill and no word why - issuing skips such a line); "" otherwise.
 */
export function linesInvoicedCell(
  r: Pick<interfaces.BillingQueueItem, "sellingLines" | "invoicedLines"> & { creditsOwed?: number; notTickedLines?: number },
): { count: string; done: boolean; creditOwed: boolean; notTicked: string; title: string } | null {
  const owed = r.creditsOwed ?? 0;
  const unticked = r.notTickedLines ?? 0;
  if (!r.sellingLines && !owed) return null;
  const notTicked = unticked ? `${unticked} line${unticked !== 1 ? "s" : ""} not ticked for Invoice` : "";
  const parts = [
    r.sellingLines ? `${r.invoicedLines} of ${r.sellingLines} selling lines invoiced` : "",
    notTicked ? `${notTicked}: tick ${unticked !== 1 ? "them" : "it"} on the job's Costs tab to bill ${unticked !== 1 ? "them" : "it"}` : "",
    owed ? `${owed === 1 ? "a credit" : `${owed} credits`} owed to the customer - give it on a credit note` : "",
  ].filter(Boolean);
  return {
    count: r.sellingLines ? `${r.invoicedLines}/${r.sellingLines}` : "",
    done: r.invoicedLines === r.sellingLines,
    creditOwed: owed > 0,
    notTicked,
    title: parts.join("; "),
  };
}
