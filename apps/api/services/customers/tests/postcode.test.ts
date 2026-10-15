import { describe, expect, it } from "vitest";
import { normaliseCountry, normalisePostcode } from "../lib/postcode";

describe("normalisePostcode", () => {
  it("stores a Czech postcode as 5 digits, however the spaces were typed", () => {
    expect(normalisePostcode("CZ", "110 00")).toBe("11000");
    expect(normalisePostcode("CZ", "11000")).toBe("11000");
    expect(normalisePostcode("CZ", " 1 1 0 0 0 ")).toBe("11000");
  });

  it("rejects a Czech postcode that is not exactly 5 digits", () => {
    expect(normalisePostcode("CZ", "1100")).toBeNull();
    expect(normalisePostcode("CZ", "110 000")).toBeNull();
    expect(normalisePostcode("CZ", "110-00")).toBeNull();
    expect(normalisePostcode("CZ", "")).toBeNull();
  });

  it("keeps another country's postcode as typed, only trimmed, but not empty", () => {
    expect(normalisePostcode("GB", " SW1A 1AA ")).toBe("SW1A 1AA");
    expect(normalisePostcode("DE", "80331")).toBe("80331");
    expect(normalisePostcode("DE", "   ")).toBeNull();
  });
});

describe("normaliseCountry", () => {
  it("upper-cases and trims the ISO code", () => {
    expect(normaliseCountry(" cz ")).toBe("CZ");
  });
});
