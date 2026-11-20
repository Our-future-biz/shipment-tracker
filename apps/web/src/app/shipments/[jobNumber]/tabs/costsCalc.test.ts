import { describe, expect, it } from "vitest";
import { computeCosts, type BuyingRow, type SellingRow } from "./costsCalc";

const buy = (over: Partial<BuyingRow>): BuyingRow => ({
  id: "b1",
  category: "Ocean freight",
  description: "",
  vendor: "",
  supplierCustomerId: null,
  receivedAt: null,
  paidOn: "",
  paidBy: "",
  paidAt: null,
  supplierInvoiceId: null,
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
  description: "",
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

  it("adds up the rows as they are shown, rounded to cents (User Council O19)", () => {
    // Three CZK lines billed in EUR at 24.335: each row shows its EUR figure rounded to cents,
    // and the total is their sum, not the sum of the unrounded conversions.
    const r = { CZK: 1, EUR: 24.335 };
    const t = computeCosts(
      [],
      [
        sell({ id: "a", amount: "38739.86" }),
        sell({ id: "b", amount: "7543.85" }),
        sell({ id: "c", amount: "31882.01" }),
      ],
      "EUR",
      r,
    );
    const rows = ["a", "b", "c"].map((id) => t.sellRowTotals[id]!);
    rows.forEach((v) => expect(Math.round(v * 100) / 100).toBe(v));
    expect(t.sellTotal).toBe(Math.round(rows.reduce((s, v) => s + v, 0) * 100) / 100);
  });

  it("gives the Report bar and the CZK line under Total selling one figure", () => {
    const r = { CZK: 1, EUR: 24.335 };
    const t = computeCosts(
      [buy({ estAmount: "1000.01", estCurrency: "EUR" })],
      [sell({ id: "a", amount: "1591.94", currency: "EUR" }), sell({ id: "b", amount: "1310.13", currency: "EUR" })],
      "EUR",
      r,
    );
    expect(t.sellTotal).toBe(2902.07);
    expect(t.sellTotalCZK).toBe(t.sellCZK);
    expect(t.sellCZK).toBe(Math.round(2902.07 * 24.335 * 100) / 100);
    expect(t.profitCZK).toBe(Math.round((t.sellCZK - t.buyCZK) * 100) / 100);
  });

  it("never converts a currency without a rate at 1 - it reports it instead", () => {
    const t = computeCosts([], [sell({ id: "a", amount: "100", currency: "GBP" }), sell({ id: "b", amount: "50" })], "CZK", rates);
    expect(t.sellTotal).toBe(50);
    expect(t.sellRowTotals.a).toBeNull();
    expect(t.missingCurrencies).toEqual(["GBP"]);
    expect(t.unconvertibleRowCount).toBe(1);
  });
});

describe("the CZK figures, as the server's job profit has them (mock council S7-1)", () => {
  const r = { CZK: 1, EUR: 25.3, USD: 22.1 };

  it("keeps a 1,000 CZK cost at 1,000.00 on a EUR-billed job, though its row reads 39.53 EUR", () => {
    const t = computeCosts([buy({ category: "thc", realAmount: "1000", realCurrency: "CZK" })], [], "EUR", r);
    expect(t.buyRowTotals.b1).toBe(39.53);
    expect(t.buyCZK).toBe(1000);
    // A job sold at what it cost shows no profit at all, not -0.11 or +0.11.
    const even = computeCosts(
      [buy({ realAmount: "1000", realCurrency: "CZK" })],
      [sell({ amount: "1000", currency: "CZK" })],
      "EUR",
      r,
    );
    expect(even.profitCZK).toBe(0);
  });

  it("adds each row's own CZK value and rounds the sum to haléř, as jobCostTotals does", () => {
    const buying = [
      buy({ id: "a", realAmount: "1000", realCurrency: "CZK" }),
      buy({ id: "b", estAmount: "123.45", estCurrency: "USD" }),
      buy({ id: "c", realAmount: "77.77", realQty: "3", realCurrency: "EUR", estAmount: "1", estCurrency: "EUR" }),
    ];
    const selling = [sell({ id: "x", amount: "2000.01", currency: "EUR" }), sell({ id: "y", amount: "999", currency: "CZK", invoice: false })];
    const t = computeCosts(buying, selling, "EUR", r);
    const cost = 1000 + 123.45 * 22.1 + 77.77 * 3 * 25.3;
    const revenue = 2000.01 * 25.3;
    expect(t.buyCZK).toBe(Math.round(cost * 100) / 100);
    expect(t.sellCZK).toBe(Math.round(revenue * 100) / 100);
    expect(t.sellTotalCZK).toBe(t.sellCZK);
    expect(t.profitCZK).toBe(Math.round((revenue - cost) * 100) / 100);
  });
});
