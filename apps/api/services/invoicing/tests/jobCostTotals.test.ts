import { describe, expect, it } from "vitest";
import { countedCost, filledIn, jobCostTotals, realCounts, type CostBuyRow, type CostSellRow } from "../lib/jobCostTotals";

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

describe("a real cost counts once its amount is filled in, even when it comes to 0", () => {
  it("takes an amount typed as 0 as filled in, and only nothing or blank text as not", () => {
    expect(["0", "0.00", "12.5"].map(filledIn)).toEqual([true, true, true]);
    expect([null, "", "  "].map(filledIn)).toEqual([false, false, false]);
  });

  it("is filled in by its amount alone: a blank amount is none, whatever its quantity", () => {
    expect([realCounts(buy({ realAmount: "0" })), realCounts(buy({ realAmount: "0.00" }))]).toEqual([true, true]);
    expect([realCounts(buy()), realCounts(buy({ realAmount: "" })), realCounts(buy({ realAmount: " ", realQty: "2" }))]).toEqual([false, false, false]);
    expect(countedCost(buy({ estAmount: "500", estCurrency: "EUR", realAmount: "0", realCurrency: "USD" }))).toEqual({ amount: 0, currency: "USD" });
    expect(countedCost(buy({ estAmount: "500", estCurrency: "EUR", realQty: "3" }))).toEqual({ amount: 500, currency: "EUR" });
  });

  it("counts a real amount of 0 typed over an estimate as 0, not the estimate", () => {
    const t = jobCostTotals([buy({ estAmount: "500", realAmount: "0" })], [sell({ amount: "800" })], "CZK", RATES, "CZK");
    expect(t).toMatchObject({ costCzk: 0, profitCzk: 800, missingCurrencies: [] });
  });

  it("counts a real quantity of 0 typed over an estimate as 0, not the estimate", () => {
    const t = jobCostTotals([buy({ estAmount: "20", estCurrency: "EUR", realAmount: "25", realQty: "0", realCurrency: "EUR" })], [], "CZK", RATES, "CZK");
    expect(t).toMatchObject({ costCzk: 0, missingCurrencies: [] });
  });

  it("needs no rate for a cost of 0: nothing is missing, the totals stay known", () => {
    const t = jobCostTotals(
      [
        buy({ estAmount: "500", realAmount: "0", realCurrency: "JPY" }),
        buy({ estAmount: "100", realAmount: "250", realQty: "0", realCurrency: "JPY" }),
        buy({ estCurrency: "JPY", realAmount: "0", realCurrency: "JPY" }),
      ],
      [],
      "CZK",
      RATES,
      "CZK",
    );
    expect(t).toMatchObject({ costCzk: 0, missingCurrencies: [] });
    // A cost that is not 0 still needs its rate.
    expect(jobCostTotals([buy({ realAmount: "1", realCurrency: "JPY" })], [], "CZK", RATES, "CZK")).toMatchObject({ costCzk: null, missingCurrencies: ["JPY"] });
  });
});
