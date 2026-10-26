import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { lineTableRows } from "./lineTable";

const selling = (id: string, partial: Partial<interfaces.SellingCostItem> = {}): interfaces.SellingCostItem => ({
  id,
  shipmentId: "s1",
  category: "",
  description: "",
  customer: id,
  qty: "1",
  amount: "100.00",
  currency: "CZK",
  invoice: true,
  sourceBuyId: null,
  vatCode: null,
  sortOrder: 0,
  sourceTruckingRef: null,
  ...partial,
});
const line = (sourceSellingCostId: string | null, description = "line") =>
  ({ sourceSellingCostId, description }) as interfaces.InvoiceDocLineItem;
const issued = (ids: string[]) => ({
  kind: "invoice" as const,
  status: "issued" as const,
  lines: ids.map((sourceSellingCostId) => ({ sourceSellingCostId }) as never),
});
const shape = (rows: ReturnType<typeof lineTableRows>) => rows.map((r) => [r.key, r.ticked, r.line ? "line" : "row"]);

describe("lineTableRows", () => {
  it("shows a ticked row by its preview line, and an unticked one by its own values, in Costs Breakdown order", () => {
    const rows = [selling("b", { sortOrder: 2, invoice: false }), selling("a", { sortOrder: 1 })];
    expect(shape(lineTableRows(rows, [line("a")], []))).toEqual([
      ["a", true, "line"],
      ["b", false, "row"],
    ]);
  });

  it("shows a just-ticked row the preview has no line for yet by its own values", () => {
    expect(shape(lineTableRows([selling("a")], [], []))).toEqual([["a", true, "row"]]);
  });

  it("leaves out rows on an open invoice, ticked or not", () => {
    const rows = [selling("a"), selling("b", { invoice: false })];
    expect(lineTableRows(rows, [], [issued(["a", "b"])])).toEqual([]);
  });

  it("leaves out rows with no value, as the invoice does: amount 0, no amount, or quantity 0", () => {
    const rows = [
      selling("zero", { amount: "0.00" }),
      selling("none", { amount: null, invoice: false }),
      selling("qty0", { qty: "0" }),
      selling("qty0off", { qty: "0", invoice: false }),
      selling("noQty", { qty: null, invoice: false }),
    ];
    expect(shape(lineTableRows(rows, [], []))).toEqual([["noQty", false, "row"]]);
  });

  it("adds preview lines of no current row at the end", () => {
    expect(shape(lineTableRows([selling("a")], [line(null, "manual"), line("a"), line("gone")], []))).toEqual([
      ["a", true, "line"],
      ["line-0", true, "line"],
      ["line-2", true, "line"],
    ]);
  });
});
