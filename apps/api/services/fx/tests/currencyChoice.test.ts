import { describe, expect, it } from "vitest";
import { parseCurrencyChoice } from "../lib/currencyChoice";

describe("a user's saved choice of currencies", () => {
  it("reads the list in its order and the base", () => {
    expect(parseCurrencyChoice('{"currencies":["GBP","EUR"],"base":"EUR"}')).toEqual({ currencies: ["GBP", "EUR"], base: "EUR" });
  });

  it("is the default - nothing chosen, against CZK - when nothing, or nothing readable, is saved", () => {
    expect(parseCurrencyChoice(null)).toEqual({ currencies: [], base: "CZK" });
    expect(parseCurrencyChoice("not json")).toEqual({ currencies: [], base: "CZK" });
    expect(parseCurrencyChoice("null")).toEqual({ currencies: [], base: "CZK" });
    expect(parseCurrencyChoice('{"currencies":["eur",1,"USD"],"base":"x"}')).toEqual({ currencies: ["USD"], base: "CZK" });
  });
});
