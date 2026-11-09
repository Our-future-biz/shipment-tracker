import { describe, expect, it } from "vitest";
import { eurTotal } from "./eurTotal";

const rates = { CZK: 1, EUR: 25, USD: 20 };

describe("amounts as one sum in EUR", () => {
  it("converts through CZK at the ČNB rates and leaves EUR as it is", () => {
    expect(eurTotal([["CZK", 7000], ["EUR", 3000]], rates)).toEqual({ eur: 3280, missing: [] });
    expect(eurTotal([["USD", 100]], rates)).toEqual({ eur: 80, missing: [] });
  });

  it("rounds to cents", () => {
    expect(eurTotal([["CZK", 100.01]], rates).eur).toBe(4);
    expect(eurTotal([["CZK", 1000.1]], rates).eur).toBe(40);
  });

  it("gives no sum when a currency has no rate, and names it", () => {
    expect(eurTotal([["CZK", 100], ["PLN", 5], ["AED", 1]], rates)).toEqual({ eur: null, missing: ["AED", "PLN"] });
  });

  it("is nothing for no amounts, and no sum without a EUR rate", () => {
    expect(eurTotal([], rates)).toEqual({ eur: 0, missing: [] });
    expect(eurTotal([["CZK", 100]], { CZK: 1 })).toEqual({ eur: null, missing: ["CZK"] });
  });
});
