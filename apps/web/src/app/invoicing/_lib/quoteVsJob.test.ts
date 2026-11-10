import { describe, expect, it } from "vitest";
import type { CostLine, SalesQuoteData } from "@/app/sales/_lib/types";
import { profitQuoteRef, quoteVsJob } from "./quoteVsJob";

const line = (type: string, currency: string, amount: number): CostLine => ({ type, description: "", currency, amount });

// A sent USD quote: its rates were stored when it went out (USD 21.862, EUR 24.335, ROE 100 %).
const quote = (over: Partial<SalesQuoteData> = {}): SalesQuoteData => ({
  quoteStatus: "won",
  currency: "USD",
  fx: { date: "2026-10-29", rates: { USD: 21.862, EUR: 24.335 }, roePct: 100, fixingDate: "2026-10-29", lockedAt: "2026-10-29T10:00:00Z" },
  sellingLines: [
    line("Ocean freight", "USD", 2499),
    line("THC", "EUR", 650),
  ],
  buyingLines: [line("Ocean freight", "USD", 2000)],
  ...over,
} as SalesQuoteData);

// The job's rates (ČNB at ATD), a little different from the quote's.
const rates = { USD: 21.646, EUR: 24.29 };

describe("profitQuoteRef", () => {
  it("prefers the quote the costs were copied from, then the buying rows', then the Sales Number", () => {
    expect(profitQuoteRef("QCZ20261110003", ["QCZ20261011004-2"], "QCZ20261011004")).toBe("QCZ20261110003");
    expect(profitQuoteRef("", ["QCZ20261011004-2"], "QCZ20261011004")).toBe("QCZ20261011004-2");
    expect(profitQuoteRef(null, [], "QCZ20261011004")).toBe("QCZ20261011004");
    // a reference of the old quotes module is no sales quote to compare with
    expect(profitQuoteRef("", [], "Q-1234")).toBeNull();
  });
});

describe("quoteVsJob", () => {
  it("puts a job that is exactly the quote apart only by the exchange rates", () => {
    const q = quote();
    // The job's own rows are the quote's lines, valued at the job's rates.
    const thc = (650 * 24.29) / 21.646;
    const jobProfit = 2499 + thc - 2000;
    const r = quoteVsJob(q, { profit: jobProfit, rxeTotal: 0, billingCurrency: "USD", rates })!;
    // the quote's own figure: 650 EUR at its rates
    expect(r.quoteProfit).toBeCloseTo(2499 + Math.round(((650 * 24.335) / 21.862) * 100) / 100 - 2000, 2);
    expect(r.ratesAndRoe).toBe(r.difference);
    expect(r.realVsEstimate).toBe(0);
    expect(r.otherRows).toBe(0);
    expect(r.missingRates).toEqual([]);
  });

  it("names real costs above the estimate and rows added later, and the parts add up to the difference", () => {
    const q = quote({ currency: "USD", sellingLines: [line("Ocean freight", "USD", 3000)], buyingLines: [line("Ocean freight", "USD", 2000)] });
    // Real cost 2050 against the estimate 2000; a storage charge of 120 sold on top.
    const r = quoteVsJob(q, { profit: 3000 + 120 - 2050, rxeTotal: 50, billingCurrency: "USD", rates })!;
    expect(r.quoteProfit).toBe(1000);
    expect(r.difference).toBe(70);
    expect(r.ratesAndRoe).toBe(0);
    expect(r.realVsEstimate).toBe(-50);
    expect(r.otherRows).toBe(120);
    expect(r.ratesAndRoe + r.realVsEstimate + r.otherRows).toBeCloseTo(r.difference, 2);
  });

  it("counts the ROE the quote added to a selling line in another currency as part of the rates", () => {
    const q = quote({
      fx: { date: "2026-10-29", rates: { USD: 21.862, EUR: 24.335 }, roePct: 102, fixingDate: "2026-10-29", lockedAt: "2026-10-29T10:00:00Z" },
      sellingLines: [line("THC", "EUR", 1000)],
      buyingLines: [],
    });
    const atQuoteRates = Math.round(((1000 * 24.335) / 21.862) * 1.02 * 100) / 100;
    const r = quoteVsJob(q, { profit: (1000 * 24.335) / 21.862, rxeTotal: 0, billingCurrency: "USD", rates: { USD: 21.862, EUR: 24.335 } })!;
    expect(r.quoteProfit).toBeCloseTo(atQuoteRates, 2);
    // same rates, so what is left is the 2 % the quote counted and the job does not
    expect(r.ratesAndRoe).toBeCloseTo(-(atQuoteRates - (1000 * 24.335) / 21.862), 1);
    expect(r.otherRows).toBe(0);
  });

  it("compares in the billing currency, and says which quote currencies the job has no rate for", () => {
    const q = quote({ sellingLines: [line("Fee", "GBP", 100), line("Ocean freight", "USD", 2499)] });
    const r = quoteVsJob(q, { profit: 0, rxeTotal: 0, billingCurrency: "CZK", rates })!;
    expect(r.missingRates).toEqual(["GBP"]);
  });

  it("gives no comparison when the quote's profit cannot be put in the billing currency", () => {
    const q = quote({ fx: undefined, rates: {} });
    expect(quoteVsJob(q, { profit: 0, rxeTotal: 0, billingCurrency: "JPY", rates: {} })).toBeNull();
  });
});
