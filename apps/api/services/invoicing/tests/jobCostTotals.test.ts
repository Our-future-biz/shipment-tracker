import { describe, expect, it } from "vitest";
import { jobCostTotals, type CostBuyRow, type CostSellRow } from "../lib/jobCostTotals";

const buy = (over: Partial<CostBuyRow> = {}): CostBuyRow => ({
  estQty: null, estAmount: null, estCurrency: "CZK", realQty: null, realAmount: null, realCurrency: "CZK", ...over,
});
const sell = (over: Partial<CostSellRow> = {}): CostSellRow => ({ qty: null, amount: null, currency: "CZK", invoice: true, ...over });
const RATES = { EUR: 25, USD: 20 };

describe("jobCostTotals", () => {
  it("counts real cost over the estimate, only invoiced selling, all through CZK", () => {
    const t = jobCostTotals(
      [buy({ estAmount: "100", estCurrency: "EUR", realAmount: "120", realCurrency: "EUR" }), buy({ estAmount: "1000", estQty: "2" })],
      [sell({ amount: "200", currency: "EUR" }), sell({ amount: "999", invoice: false })],
      "EUR",
      RATES,
      "EUR",
    );
    // cost: 120 EUR (real wins) = 3000 CZK + 2 × 1000 CZK = 5000 CZK; revenue: 200 EUR = 5000 CZK
    expect(t).toEqual({ revenueCzk: 5000, costCzk: 5000, profitCzk: 0, revenue: 200, cost: 200, profit: 0, missingCurrencies: [] });
  });

  it("keeps a typed 0 quantity at 0 and a blank one at 1", () => {
    const t = jobCostTotals([], [sell({ amount: "100", qty: "0" }), sell({ amount: "50", qty: "" })], "CZK", RATES, "CZK");
    expect(t.revenueCzk).toBe(50);
  });

  it("never takes an amount at 1 when its currency has no rate: the totals are unknown", () => {
    const t = jobCostTotals([buy({ estAmount: "10", estCurrency: "JPY" })], [sell({ amount: "5", currency: "EUR" })], "CZK", RATES, "CZK");
    expect(t).toMatchObject({ revenueCzk: null, costCzk: null, profitCzk: null, missingCurrencies: ["JPY"] });
  });

  it("is unknown without a rate for the billing currency, and shows null in a currency without a rate", () => {
    expect(jobCostTotals([], [sell({ amount: "5" })], "GBP", RATES, "CZK").missingCurrencies).toEqual(["GBP"]);
    expect(jobCostTotals([], [sell({ amount: "100" })], "CZK", RATES, "GBP")).toMatchObject({ revenueCzk: 100, revenue: null });
  });
});
