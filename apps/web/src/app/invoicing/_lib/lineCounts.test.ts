import { describe, expect, it } from "vitest";
import { invoicedLineCount } from "./lineCounts";

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
