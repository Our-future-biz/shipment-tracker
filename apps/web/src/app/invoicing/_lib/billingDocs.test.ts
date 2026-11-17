import { describe, expect, it } from "vitest";
import { billingDocs, openInvoiceRowIds } from "./openInvoices";

const line = (source: string | null) => ({ description: "", qty: "1", unitPrice: "1", unitCurrency: "EUR", net: "1", vatCode: "S21" as const, vatRate: "21", sourceSellingCostId: source });
const invoice = (id: string, status: "issued" | "credited", sources: string[]) => ({ id, kind: "invoice" as const, status, correctsInvoiceId: null, lines: sources.map(line) });
const creditNote = (id: string, corrects: string, sources: string[]) => ({ id, kind: "credit_note" as const, status: "issued" as const, correctsInvoiceId: corrects, lines: sources.map(line) });

describe("openInvoiceRowIds", () => {
  it("counts the rows of a partial credit note as billed while its invoice stands", () => {
    const docs = [invoice("i1", "issued", ["s1", "s2"]), creditNote("c1", "i1", ["credit-row"])];
    expect(openInvoiceRowIds(docs)).toEqual(new Set(["s1", "s2", "credit-row"]));
    expect(billingDocs(docs).map((d) => d.id)).toEqual(["i1", "c1"]);
  });

  it("counts nothing of an invoice credited to its end, nor of its credit notes", () => {
    const docs = [invoice("i1", "credited", ["s1"]), creditNote("c1", "i1", ["credit-row"]), creditNote("c2", "i1", ["s1"])];
    expect(openInvoiceRowIds(docs)).toEqual(new Set());
  });
});
