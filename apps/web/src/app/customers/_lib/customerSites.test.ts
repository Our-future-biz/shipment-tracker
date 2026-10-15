import { describe, expect, it } from "vitest";
import { formatPostcode, siteAddressLine } from "./customerSites";

describe("formatPostcode", () => {
  it("shows a Czech postcode as 3 + 2 digits", () => {
    expect(formatPostcode("CZ", "11000")).toBe("110 00");
  });

  it("shows another country's postcode as stored", () => {
    expect(formatPostcode("DE", "80331")).toBe("80331");
    expect(formatPostcode("GB", "SW1A 1AA")).toBe("SW1A 1AA");
  });
});

describe("siteAddressLine", () => {
  it("joins the parts that are there", () => {
    expect(siteAddressLine({ street: "Jankovcova 1522/53", postcode: "17000", city: "Praha 7", country: "CZ" })).toBe(
      "Jankovcova 1522/53, 170 00 Praha 7, CZ",
    );
    expect(siteAddressLine({ street: "", postcode: "17000", city: "", country: "CZ" })).toBe("170 00, CZ");
  });
});
