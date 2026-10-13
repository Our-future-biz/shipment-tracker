import { describe, expect, it } from "vitest";
import { computeCosts, type BuyingRow, type SellingRow } from "@/app/shipments/[jobNumber]/tabs/costsCalc";
import { buildInvoiceDraft } from "./invoiceLines";

const rates = { CZK: 1, EUR: 25, USD: 22 };

const sell = (over: Partial<SellingRow>): SellingRow => ({
  id: "s",
  category: "Ocean freight",
  customer: "",
  qty: "1",
  amount: "",
  currency: "CZK",
  invoice: true,
  sourceBuyId: null,
  ...over,
});

const buy = (over: Partial<BuyingRow>): BuyingRow => ({
  id: "b",
  category: "Ocean freight",
  vendor: "",
  estQty: "1",
  estAmount: "",
  estCurrency: "CZK",
  realQty: "1",
  realAmount: "",
  realCurrency: "CZK",
  invoiceNumber: "",
  received: false,
  ...over,
});

const draft = (buying: BuyingRow[], selling: SellingRow[], billing = "CZK") =>
  buildInvoiceDraft(selling, computeCosts(buying, selling, billing, rates));

describe("buildInvoiceDraft", () => {
  it("bills only the rows ticked for Invoice, each by its own currency", () => {
    const d = draft(
      [],
      [
        sell({ id: "a", amount: "1000", currency: "EUR" }),
        sell({ id: "b", category: "THC Destination", amount: "5 000,00" }),
        sell({ id: "c", amount: "999", invoice: false }),
      ],
    );
    expect(d.lines.map((l) => [l.label, l.total])).toEqual([
      ["Ocean freight", 25000],
      ["THC Destination", 5000],
    ]);
    expect(d.total).toBe(30000);
  });

  it("computes profit and margin against buying costs", () => {
    const d = draft([buy({ realAmount: "800", realCurrency: "EUR" })], [sell({ amount: "1000", currency: "EUR" })], "EUR");
    expect(d.total).toBe(1000);
    expect(d.cost).toBe(800);
    expect(d.profit).toBe(200);
    expect(d.marginPct).toBe(20);
  });

  it("keeps discounts (negative lines) on the invoice and in the total", () => {
    const d = draft([], [sell({ id: "a", amount: "1000" }), sell({ id: "b", category: "Discount", amount: "-150" })]);
    expect(d.lines).toHaveLength(2);
    expect(d.total).toBe(850);
  });

  it("total equals the sum of the rounded lines", () => {
    const d = draft([], [sell({ id: "a", amount: "0,335" }), sell({ id: "b", amount: "0,335" }), sell({ id: "c", amount: "0,335" })]);
    // each line prints as 0.34, so the total must be 1.02 (not 1.01 from 1.005)
    expect(d.lines.map((l) => l.total)).toEqual([0.34, 0.34, 0.34]);
    expect(d.total).toBe(1.02);
  });

  it("reports ticked rows without an exchange rate instead of billing them at 1", () => {
    const d = draft([], [sell({ id: "a", amount: "100", currency: "GBP" }), sell({ id: "b", amount: "50" })]);
    expect(d.unconvertible.map((r) => r.id)).toEqual(["a"]);
    expect(d.total).toBe(50);
  });

  it("has no margin when there is nothing to invoice", () => {
    const d = draft([buy({ estAmount: "100" })], []);
    expect(d.total).toBe(0);
    expect(d.profit).toBe(-100);
    expect(d.marginPct).toBeNull();
  });
});
