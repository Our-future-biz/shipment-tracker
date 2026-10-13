import { describe, expect, it } from "vitest";
import { countryValue, placeCodeOf, resolveCountryCode } from "../../../lib/geo/format";

describe("resolveCountryCode", () => {
  it.each([
    ["DE", "DE"],
    ["de", "DE"],
    ["Germany", "DE"],
    ["GERMANY", "DE"],
    ["Germany (DE)", "DE"],
    ["USA", "US"],
    ["United States", "US"],
    ["UNITED STATES OF AMERICA", "US"],
    ["Czech Republic", "CZ"],
    ["Taiwan", "TW"],
    ["South Korea", "KR"],
    ["Côte d’Ivoire", "CI"],
    ["COTE D'IVOIRE", "CI"],
    ["UK", "GB"],
  ])("%s → %s", (text, code) => {
    expect(resolveCountryCode(text)).toBe(code);
  });

  it.each(["FLORIDA", "Bavaria", "", "Atlantis"])("%s → null", (text) => {
    expect(resolveCountryCode(text)).toBeNull();
  });
});

describe("stored forms", () => {
  it("writes countries as name + code, or the code alone", () => {
    expect(countryValue("DE", "country")).toBe("Germany (DE)");
    expect(countryValue("DE", "countryCode")).toBe("DE");
    expect(countryValue("XX", "country")).toBeNull();
  });

  it("reads the code of a place label", () => {
    expect(placeCodeOf("Hamburg (DEHAM)")).toBe("DEHAM");
    expect(placeCodeOf("Ostend (Oostende) (BEOST)")).toBe("BEOST");
    expect(placeCodeOf("HAMBURG")).toBeNull();
  });
});
