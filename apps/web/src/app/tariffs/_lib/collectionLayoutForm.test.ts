import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { surchargeText, weightToText, volumeToText } from "./collectionTariffs";
import { cleanCollectionLayout, collectionLayoutProblems, countryCodesText, newMatrix, newZone, parseCountryCodes, withZoneBy } from "./collectionLayoutForm";

// A TOPTRANS-like layout: one CZ table of two km zones, zones by distance from its own lists.
const LAYOUT: interfaces.CollectionLayout = {
  name: "TOPTRANS – CZ / SK",
  currency: "CZK",
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  zoneBy: "distance",
  matrices: [
    {
      label: "CZ → CZ",
      country: "CZ",
      sheet: "Ceník CZ-CZ",
      headerRow: 13,
      firstDataRow: 14,
      lastDataRow: 30,
      weightTo: "B",
      volumeTo: "C",
      zones: [
        { column: "E", label: "100 km", kmTo: 100, zone: null },
        { column: "F", label: "200 km", kmTo: 200, zone: null },
      ],
    },
  ],
  kgPerCbm: null,
  regions: { sheet: "Routing", firstDataRow: 2, lastDataRow: null, postcode: "B", region: "C", country: "D", place: "A", countryCodes: { "1": "CZ", "2": "SK" }, defaultCountry: "CZ" },
  distances: { sheet: "Distance", firstDataRow: 2, lastDataRow: null, fromRegion: "A", toRegion: "B", km: "D" },
  sameRegionKm: 50,
  areas: null,
  surcharges: [{ kind: "oversize", label: "Oversize", overLengthCm: 350, percent: 50, amount: null }],
  conditions: ["Fuel and toll included"],
  links: [],
};

describe("country codes", () => {
  it("reads and writes them as people type them", () => {
    expect(countryCodesText({ "1": "CZ", "2": "SK" })).toBe("1=CZ, 2=SK");
    expect(parseCountryCodes(" 1 = cz; 2=SK, x, 3=Czechia")).toEqual({ "1": "CZ", "2": "SK" });
  });
});

describe("new parts", () => {
  it("adds a distance zone 100 km further, or the next postcode zone", () => {
    expect(newZone(LAYOUT.matrices[0]!, "distance")).toEqual({ column: "", label: "300 km", kmTo: 300, zone: null });
    expect(newZone({ ...LAYOUT.matrices[0]!, zones: [] }, "postcode")).toEqual({ column: "", label: "Zone 1", kmTo: null, zone: "1" });
  });

  it("starts a new table on the sheet and rows of the last one", () => {
    expect(newMatrix(LAYOUT, "Other")).toMatchObject({ label: "", country: "", sheet: "Ceník CZ-CZ", headerRow: 13, firstDataRow: 14, weightTo: "B", zones: [] });
  });

  it("gives postcode zones a code and a blank areas table when the zones change to postcode areas", () => {
    const byArea = withZoneBy(LAYOUT, "postcode", "Ceník CZ-CZ");
    expect(byArea.matrices[0]!.zones.map((z) => z.zone)).toEqual(["1", "2"]);
    expect(byArea.areas).toMatchObject({ sheet: "Ceník CZ-CZ", postcodeFrom: "", zone: "", defaultCountry: "CZ" });
  });
});

describe("cleanCollectionLayout", () => {
  it("trims, upper-cases and leaves out what the zone choice does not use", () => {
    const clean = cleanCollectionLayout({
      ...LAYOUT,
      currency: " czk ",
      matrices: [{ ...LAYOUT.matrices[0]!, country: "cz", weightTo: "b", volumeTo: " ", zones: [{ column: "e", label: " 100 km ", kmTo: 100, zone: "x" }] }],
      areas: { sheet: "x", firstDataRow: 2, lastDataRow: null, postcodeFrom: "A", postcodeTo: null, zone: "B", country: null, defaultCountry: "CZ" },
      surcharges: [{ kind: "flat", label: " Handling ", overLengthCm: 350, percent: 10, amount: 50 }],
      conditions: [" Fuel included ", ""],
    });
    expect(clean.currency).toBe("CZK");
    expect(clean.matrices[0]).toMatchObject({ country: "CZ", weightTo: "B", volumeTo: null, zones: [{ column: "E", label: "100 km", kmTo: 100, zone: null }] });
    expect(clean.areas).toBeNull();
    expect(clean.surcharges).toEqual([{ kind: "flat", label: "Handling", overLengthCm: null, percent: null, amount: 50 }]);
    expect(clean.conditions).toEqual(["Fuel included"]);
  });
});

describe("collectionLayoutProblems", () => {
  it("is empty for a layout that can be sent", () => {
    expect(collectionLayoutProblems(LAYOUT)).toEqual([]);
  });

  it.each([
    ["km that do not grow", { matrices: [{ ...LAYOUT.matrices[0]!, zones: [{ ...LAYOUT.matrices[0]!.zones[1]! }, { ...LAYOUT.matrices[0]!.zones[0]!, column: "G" }] }] }, "each further"],
    ["a column used twice", { matrices: [{ ...LAYOUT.matrices[0]!, zones: [LAYOUT.matrices[0]!.zones[0]!, { ...LAYOUT.matrices[0]!.zones[1]!, column: "E" }] }] }, "two zones"],
    ["no region list", { regions: null }, "postcode → region list"],
    ["an oversize surcharge without its length", { surcharges: [{ ...LAYOUT.surcharges[0]!, overLengthCm: null }] }, "the length"],
    ["a currency that is no code", { currency: "Kč" }, "currency"],
  ])("names %s", (_, change, text) => {
    expect(collectionLayoutProblems({ ...LAYOUT, ...change }).join(" | ")).toContain(text);
  });

  it("asks for postcode areas and zone codes when the zones are by postcode area", () => {
    const problems = collectionLayoutProblems({ ...LAYOUT, zoneBy: "postcode" });
    expect(problems.join(" | ")).toContain("postcode areas");
    expect(problems.join(" | ")).toContain("zone its postcode areas name");
  });
});

describe("how a tariff reads", () => {
  it("names its weight rows, volumes and surcharges", () => {
    expect(weightToText(1500)).toBe("up to 1 500 kg");
    expect(volumeToText(0.12)).toBe("≤ 0.12 m³");
    expect(surchargeText(LAYOUT.surcharges[0]!, "CZK")).toBe("Oversize: +50 % for a piece over 350 cm");
    expect(surchargeText({ kind: "flat", label: "Handling", overLengthCm: null, percent: null, amount: 50 }, "CZK")).toBe("Handling: 50 CZK per consignment");
  });
});
