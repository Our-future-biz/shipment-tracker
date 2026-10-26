import { describe, expect, it } from "vitest";
import { hasLineValue, invoicedLineCount } from "./lineCounts";

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
