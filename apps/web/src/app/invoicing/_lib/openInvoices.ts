import type { interfaces } from "@/lib/api/client";

type Doc = interfaces.InvoiceDocItem;

/** An open invoice: issued and not credited. A credit note never is one. */
const isOpenInvoice = (d: Pick<Doc, "kind" | "status">) => d.kind === "invoice" && d.status === "issued";

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
