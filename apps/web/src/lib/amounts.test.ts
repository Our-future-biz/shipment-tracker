import { describe, expect, it } from "vitest";
import { amountsText, sumAmounts } from "./amounts";

describe("amounts per currency", () => {
  it("writes amounts per currency, never one total", () => {
    expect(amountsText([{ currency: "EUR", amount: 1200 }, { currency: "USD", amount: 300.5 }])).toBe("1,200 EUR · 300.50 USD");
    expect(amountsText([])).toBe("—");
  });

  it("adds amounts up per currency, largest first", () => {
    expect(sumAmounts([[{ currency: "EUR", amount: 0.1 }], [{ currency: "EUR", amount: 0.2 }, { currency: "USD", amount: 5 }]])).toEqual([
      { currency: "USD", amount: 5 },
      { currency: "EUR", amount: 0.3 },
    ]);
  });
});
