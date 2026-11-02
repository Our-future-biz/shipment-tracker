import { describe, expect, it } from "vitest";
import { lineVsEstimate, totalVsEstimate } from "../lib/masterJobVsEstimate";

const RATES: Record<string, number> = { CZK: 1, EUR: 25, USD: 20 };
const czkPer = (c: string) => RATES[c] ?? null;
const line = (over: Record<string, string | null> = {}) => ({
  estAmount: "100.00", estQty: "2", estCurrency: "EUR", realAmount: "110.00", realQty: "2", realCurrency: "EUR", ...over,
});

describe("buying costs against their estimates", () => {
  it("compares a line in its own currency, with the CZK difference beside", () => {
    expect(lineVsEstimate(line(), czkPer)).toEqual({ delta: 20, currency: "EUR", czk: 500 });
  });

  it("compares in CZK at today's rates when the line's currencies differ, and not without a rate", () => {
    expect(lineVsEstimate(line({ realCurrency: "USD", realAmount: "120.00" }), czkPer)).toEqual({ delta: -200, currency: "CZK", czk: -200 });
    expect(lineVsEstimate(line({ realCurrency: "GBP" }), czkPer)).toBeNull();
  });

  it("waits for both the estimate and the real cost", () => {
    expect(lineVsEstimate(line({ realAmount: null }), czkPer)).toBeNull();
    expect(lineVsEstimate(line({ estAmount: "" }), czkPer)).toBeNull();
  });

  it("totals the master job in its lines' one currency, else in CZK", () => {
    const eur = lineVsEstimate(line(), czkPer)!;
    const usd = lineVsEstimate(line({ estCurrency: "USD", realCurrency: "USD" }), czkPer)!;
    expect(totalVsEstimate([eur, eur])).toEqual({ delta: 40, currency: "EUR" });
    expect(totalVsEstimate([eur, usd])).toEqual({ delta: 500 + 400, currency: "CZK" });
    expect(totalVsEstimate([])).toBeNull();
  });
});
