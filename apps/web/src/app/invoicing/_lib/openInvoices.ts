import type { interfaces } from "@/lib/api/client";

type Doc = interfaces.InvoiceDocItem;

/** An open invoice: issued and not credited. A credit note never is one. */
export const isOpenInvoice = (d: Pick<Doc, "kind" | "status">) => d.kind === "invoice" && d.status === "issued";

/** The selling rows on an open invoice: billed already, so they are not on the next one. */
export function openInvoiceRowIds(docs: readonly Pick<Doc, "kind" | "status" | "lines">[]): Set<string> {
  return new Set(
    docs
      .filter(isOpenInvoice)
      .flatMap((d) => d.lines.map((l) => l.sourceSellingCostId))
      .filter((id): id is string => !!id),
  );
}

/**
 * The DUZP a job shows: that of its newest open invoice, the one with the highest number (as the
 * queue's DUZP column, API invoiceDocument.service queue), else the one the next invoice would get.
 * Picked by number, not by position: the API lists a job's invoices newest first.
 */
export function jobDuzp(docs: readonly Pick<Doc, "kind" | "status" | "number" | "duzp">[], nextDuzp: string | null): string | null {
  const newest = docs.filter(isOpenInvoice).reduce<(typeof docs)[number] | null>((a, d) => (!a || d.number > a.number ? d : a), null);
  return newest ? newest.duzp : nextDuzp;
}

export const ADDED_AFTER_BILLING = "Added after billing";
export const NOT_INVOICED_YET = "Not invoiced yet";

/**
 * What a selling row of a billed shipment shows while it is on no open invoice, so the change in the
 * job's profit is seen: added after the shipment's first open invoice, or there before it and left off
 * it. null while the shipment has no open invoice, or once the row is on one.
 */
export function notInvoicedMark(
  row: { id: string; createdAt?: string },
  docs: readonly Pick<Doc, "kind" | "status" | "lines" | "createdAt">[],
): typeof ADDED_AFTER_BILLING | typeof NOT_INVOICED_YET | null {
  const open = docs.filter(isOpenInvoice);
  if (!open.length || open.some((d) => d.lines.some((l) => l.sourceSellingCostId === row.id))) return null;
  const firstBilled = open.reduce((first, d) => (new Date(d.createdAt).getTime() < first ? new Date(d.createdAt).getTime() : first), Infinity);
  const added = row.createdAt ? new Date(row.createdAt).getTime() : NaN;
  return added > firstBilled ? ADDED_AFTER_BILLING : NOT_INVOICED_YET;
}
