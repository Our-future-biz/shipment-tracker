import { describe, expect, it } from "vitest";
import { fxRateText } from "./fxRateText";

describe("fxRateText (the Issue dialog's rate, B16)", () => {
  it("names the rate with 3 decimals and its fixing, as the PDF prints it", () => {
    expect(fxRateText({ currency: "EUR", fxRate: 24.425, fxFixingDate: "2026-11-19" })).toBe("ČNB rate at the DUZP: 1 EUR = 24.425 CZK (fixing 19.11.2026)");
    expect(fxRateText({ currency: "USD", fxRate: 21.1, fxFixingDate: null })).toBe("ČNB rate at the DUZP: 1 USD = 21.100 CZK");
  });

  it("says nothing for a CZK invoice or while there is no rate", () => {
    expect(fxRateText({ currency: "CZK", fxRate: 1, fxFixingDate: "2026-11-19" })).toBe("");
    expect(fxRateText({ currency: "EUR", fxRate: 0, fxFixingDate: null })).toBe("");
  });
});
