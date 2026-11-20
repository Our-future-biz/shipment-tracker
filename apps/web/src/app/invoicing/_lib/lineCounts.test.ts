import { describe, expect, it } from "vitest";
import { hasLineValue, invoicedLineCount, linesInvoicedCell } from "./lineCounts";

const row = (id: string, amount: string | null = "100.00", qty: string | null = "1.00") => ({ id, amount, qty });
const doc = (kind: "invoice" | "credit_note", status: "issued" | "credited", ids: (string | null)[]) => ({
  kind,
  status,
  lines: ids.map((sourceSellingCostId) => ({ sourceSellingCostId }) as never),
});

describe("invoicedLineCount", () => {
  it("counts the lines on issued invoices of all lines with a value", () => {
    const rows = [row("a"), row("b"), row("c"), row("zero", "0.00"), row("none", null), row("noQty", "50.00", null)];
    expect(invoicedLineCount(rows, [doc("invoice", "issued", ["a", "noQty", null])])).toEqual({ invoiced: 2, total: 4 });
  });

  it("does not count lines of a credited invoice or of a credit note", () => {
    const rows = [row("a"), row("b")];
    const docs = [doc("invoice", "credited", ["a", "b"]), doc("credit_note", "issued", ["a", "b"])];
    expect(invoicedLineCount(rows, docs)).toEqual({ invoiced: 0, total: 2 });
  });

  it("leaves out a credit owed on no invoice and the row a partial credit note put on the job (B19)", () => {
    const rows = [row("a"), row("b"), row("owed", "-20.00"), { ...row("cn-row", "-100.00"), sourceCreditNoteId: "cn1" }];
    const docs = [
      { ...doc("invoice", "issued", ["a"]), id: "i1" },
      { ...doc("credit_note", "issued", ["cn-row"]), id: "cn1", correctsInvoiceId: "i1" },
    ];
    expect(invoicedLineCount(rows, docs)).toEqual({ invoiced: 1, total: 2 });
  });

  it("is 0 of 0 for a job without lines", () => {
    expect(invoicedLineCount([], [])).toEqual({ invoiced: 0, total: 0 });
  });
});

describe("hasLineValue", () => {
  it("is false for a line the invoice leaves out: amount 0 or empty, or quantity 0", () => {
    expect(hasLineValue({ amount: "100.00", qty: "2" })).toBe(true);
    expect(hasLineValue({ amount: "100.00", qty: null })).toBe(true);
    expect(hasLineValue({ amount: "100.00", qty: "" })).toBe(true);
    expect(hasLineValue({ amount: "-50.00", qty: "1" })).toBe(true);
    expect(hasLineValue({ amount: "100.00", qty: "0" })).toBe(false);
    expect(hasLineValue({ amount: "0.00", qty: "1" })).toBe(false);
    expect(hasLineValue({ amount: null, qty: "1" })).toBe(false);
  });
});

describe("linesInvoicedCell (the queue's Lines Invoiced, M3)", () => {
  it("shows the charges invoiced, and a credit owed even when every charge is invoiced", () => {
    expect(linesInvoicedCell({ sellingLines: 3, invoicedLines: 2, creditsOwed: 0 })).toEqual({ count: "2/3", done: false, creditOwed: false, notTicked: "", title: "2 of 3 selling lines invoiced" });
    expect(linesInvoicedCell({ sellingLines: 2, invoicedLines: 2, creditsOwed: 1 })).toEqual({
      count: "2/2",
      done: true,
      creditOwed: true,
      notTicked: "",
      title: "2 of 2 selling lines invoiced; a credit owed to the customer - give it on a credit note",
    });
    expect(linesInvoicedCell({ sellingLines: 0, invoicedLines: 0, creditsOwed: 2 })).toMatchObject({ count: "", creditOwed: true, title: "2 credits owed to the customer - give it on a credit note" });
    expect(linesInvoicedCell({ sellingLines: 0, invoicedLines: 0, creditsOwed: 0 })).toBeNull();
  });

  // Mock council S5-3: in To bill with 0 to bill, the row says why.
  it("names the charges not ticked for Invoice", () => {
    expect(linesInvoicedCell({ sellingLines: 5, invoicedLines: 4, creditsOwed: 0, notTickedLines: 1 })).toMatchObject({
      count: "4/5",
      notTicked: "1 line not ticked for Invoice",
      title: "4 of 5 selling lines invoiced; 1 line not ticked for Invoice: tick it on the job's Costs tab to bill it",
    });
    expect(linesInvoicedCell({ sellingLines: 5, invoicedLines: 3, notTickedLines: 2 })?.notTicked).toBe("2 lines not ticked for Invoice");
  });
});
