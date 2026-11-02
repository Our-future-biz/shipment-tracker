import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => ({ APIError: { invalidArgument: (msg: string) => new Error(msg) } }));

import { billingCurrencies } from "../lib/billingCurrencies";

describe("billingCurrencies", () => {
  it("keeps up to two secondary currencies, upper-case and without duplicates", () => {
    expect(billingCurrencies("eur", ["usd", "CZK", "USD"])).toEqual({ currency: "EUR", secondaryCurrencies: ["USD", "CZK"] });
    expect(billingCurrencies("EUR", [])).toEqual({ currency: "EUR", secondaryCurrencies: [] });
  });

  it("drops a secondary currency that becomes the default", () => {
    expect(billingCurrencies("USD", ["USD", "CZK"])).toEqual({ currency: "USD", secondaryCurrencies: ["CZK"] });
  });

  it("refuses a third secondary currency or a non-code", () => {
    expect(() => billingCurrencies("EUR", ["USD", "CZK", "GBP"])).toThrow("at most 2");
    expect(() => billingCurrencies("EUR", ["dollars"])).toThrow("not a currency code");
  });
});
