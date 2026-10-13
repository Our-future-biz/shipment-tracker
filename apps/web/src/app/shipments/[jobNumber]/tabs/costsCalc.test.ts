import { describe, expect, it } from "vitest";
import { computeCosts, type BuyingRow, type SellingRow } from "./costsCalc";

const buy = (over: Partial<BuyingRow>): BuyingRow => ({
  id: "b1",
  category: "Ocean freight",
  vendor: "",
  estQty: "",
  estAmount: "",
  estCurrency: "CZK",
  realQty: "",
  realAmount: "",
  realCurrency: "CZK",
  invoiceNumber: "",
  received: false,
  ...over,
});

const sell = (over: Partial<SellingRow>): SellingRow => ({
  id: "s1",
  category: "Ocean freight",
  customer: "",
  qty: "",
  amount: "",
  currency: "CZK",
  invoice: true,
  sourceBuyId: null,
  ...over,
});

const rates = { CZK: 1, EUR: 25, USD: 22 };

describe("computeCosts", () => {
  it("converts each row by its own currency (no single ROE for all rows)", () => {
    // the council's example: 1000 EUR + 5000 CZK billed in CZK = 30 000, not 150 000
    const t = computeCosts(
      [],
      [sell({ id: "a", amount: "1000", currency: "EUR" }), sell({ id: "b", amount: "5000", currency: "CZK" })],
      "CZK",
      rates,
    );
    expect(t.sellTotal).toBe(30000);
    expect(t.sellTotalCZK).toBe(30000);
  });

  it("converts into a foreign billing currency through CZK", () => {
    const t = computeCosts([], [sell({ amount: "5000", currency: "CZK" })], "EUR", rates);
    expect(t.sellTotal).toBe(200);
    expect(t.sellCZK).toBe(5000);
  });

  it("reads Czech decimal commas and quantities", () => {
    const t = computeCosts([], [sell({ amount: "1 250,50", qty: "2" })], "CZK", rates);
    expect(t.sellTotal).toBe(2501);
  });

  it("uses Real cost when filled, Est. otherwise, and computes profit", () => {
    const t = computeCosts(
      [
        buy({ id: "x", estAmount: "100", estCurrency: "EUR", realAmount: "110", realCurrency: "EUR" }),
        buy({ id: "y", estAmount: "1000" }),
      ],
      [sell({ amount: "200", currency: "EUR" })],
      "CZK",
      rates,
    );
    expect(t.buyTotal).toBe(110 * 25 + 1000);
    expect(t.sellTotal).toBe(5000);
    expect(t.profitCZK).toBe(5000 - 3750);
    expect(t.rxeTotal).toBe(250);
  });

  it("leaves rows not ticked for invoicing out of revenue", () => {
    const t = computeCosts(
      [],
      [sell({ id: "a", amount: "100" }), sell({ id: "b", amount: "40", invoice: false })],
      "CZK",
      rates,
    );
    expect(t.sellTotal).toBe(100);
    expect(t.sellNotInvoicedTotal).toBe(40);
    expect(t.sellNotInvoicedCount).toBe(1);
  });

  it("never converts a currency without a rate at 1 - it reports it instead", () => {
    const t = computeCosts([], [sell({ id: "a", amount: "100", currency: "GBP" }), sell({ id: "b", amount: "50" })], "CZK", rates);
    expect(t.sellTotal).toBe(50);
    expect(t.sellRowTotals.a).toBeNull();
    expect(t.missingCurrencies).toEqual(["GBP"]);
    expect(t.unconvertibleRowCount).toBe(1);
  });
});
