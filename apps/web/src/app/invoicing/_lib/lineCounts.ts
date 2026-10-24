import type { interfaces } from "@/lib/api/client";

/** A quantity left empty counts as 1, as on the invoice (API invoiceCalc qtyOrOne). */
const qtyOrOne = (v: string | null | undefined) => {
  if (v === null || v === undefined || v.trim() === "") return 1;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * How many of a job's selling lines are on an open (issued, not credited) invoice, of all of
 * them. A line with no value is left out, as it is never invoiced. The same count as the queue's
 * Lines Invoiced column (API lib/billingQueue countInvoicedLines).
 */
export function invoicedLineCount(
  sellingCosts: readonly Pick<interfaces.SellingCostItem, "id" | "qty" | "amount">[],
  docs: readonly Pick<interfaces.InvoiceDocItem, "kind" | "status" | "lines">[],
): { invoiced: number; total: number } {
  const onOpenInvoice = new Set(
    docs
      .filter((d) => d.kind === "invoice" && d.status === "issued")
      .flatMap((d) => d.lines.map((l) => l.sourceSellingCostId))
      .filter((id): id is string => !!id),
  );
  const lines = sellingCosts.filter((r) => Number(r.amount ?? 0) * qtyOrOne(r.qty));
  return { invoiced: lines.filter((r) => onOpenInvoice.has(r.id)).length, total: lines.length };
}
