import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { collectionLayoutProblem, parseCollectionLayout, tidyCollectionLayout } from "../lib/collectionLayout";

const zones = (cols: string) => cols.split("").map((column, i) => ({ column, label: `${(i + 1) * 100} km`, kmTo: (i + 1) * 100, zone: null }));

// A layout as the AI answers it for a TOPTRANS-like file: letters and codes in any case.
const AI_ANSWER = {
  name: "TOPTRANS – CZ / SK",
  currency: "czk",
  validFrom: null,
  validTo: "2025-02-28",
  zoneBy: "distance",
  matrices: [
    { label: "CZ → CZ", country: "cz", sheet: "Ceník CZ-CZ", headerRow: 13, firstDataRow: 14, lastDataRow: 30, weightTo: "b", volumeTo: "c", zones: zones("EFG") },
    { label: "CZ → SK", country: "SK", sheet: "Ceník CZ-SK", headerRow: 14, firstDataRow: 15, lastDataRow: null, weightTo: "B", volumeTo: "C", zones: zones("EFGH") },
  ],
  kgPerCbm: null,
  regions: { sheet: "Routing", firstDataRow: 2, lastDataRow: null, postcode: "B", region: "C", country: "D", place: "A", countryCodes: { "1": "cz", "2": "SK" }, defaultCountry: "CZ" },
  distances: { sheet: "Distance", firstDataRow: 2, lastDataRow: null, fromRegion: "A", toRegion: "B", km: "D" },
  sameRegionKm: 50,
  areas: null,
  surcharges: [{ kind: "oversize", label: "Oversize", overLengthCm: 350, percent: 50, amount: null }],
  conditions: ["Fuel and toll included"],
  links: [],
};

describe("parseCollectionLayout", () => {
  it("tidies an AI answer: upper-case letters and codes", () => {
    const layout = parseCollectionLayout(AI_ANSWER);
    expect(layout.currency).toBe("CZK");
    expect(layout.matrices[0]).toMatchObject({ country: "CZ", weightTo: "B", volumeTo: "C" });
    expect(layout.regions!.countryCodes).toEqual({ "1": "CZ", "2": "SK" });
  });

  it.each([
    ["zones by distance without the region list", { regions: null }, "regions"],
    ["zones by distance without the distance list", { distances: null }, "regions"],
    ["zones by postcode without the areas", { zoneBy: "postcode" }, "areas"],
    ["a zone whose km is not further than the one before", { matrices: [{ ...AI_ANSWER.matrices[0], zones: [...zones("EF"), { column: "G", label: "x", kmTo: 150, zone: null }] }] }, "matrices"],
    ["a zone column listed twice", { matrices: [{ ...AI_ANSWER.matrices[0], zones: [...zones("E"), { column: "E", label: "x", kmTo: 900, zone: null }] }] }, "matrices.0.zones"],
    ["a price row above the headings", { matrices: [{ ...AI_ANSWER.matrices[0], firstDataRow: 10 }] }, "matrices.0.firstDataRow"],
    ["an oversize surcharge without its length", { surcharges: [{ kind: "oversize", label: "x", overLengthCm: null, percent: 50, amount: null }] }, "surcharges.0"],
    ["a flat surcharge without its amount", { surcharges: [{ kind: "flat", label: "x", overLengthCm: null, percent: null, amount: null }] }, "surcharges.0"],
    ["no price table", { matrices: [] }, "matrices"],
  ])("refuses %s, naming where", (_, change, where) => {
    expect(() => parseCollectionLayout({ ...AI_ANSWER, ...change })).toThrow(expect.objectContaining({ code: "invalid_argument", message: expect.stringContaining(where) }));
  });
});

describe("tidyCollectionLayout", () => {
  it("lets small slips of the AI through: missing tables and factors as none, a name and default country filled in", () => {
    const layout = parseCollectionLayout(
      tidyCollectionLayout({
        ...AI_ANSWER,
        name: " ",
        kgPerCbm: undefined,
        areas: undefined,
        matrices: [{ ...AI_ANSWER.matrices[0], lastDataRow: undefined, volumeTo: undefined }],
        regions: { ...AI_ANSWER.regions, defaultCountry: undefined, place: undefined },
        surcharges: [{ kind: "percent", label: "Fuel", percent: 12 }],
        links: [{ label: "Web", url: "www.toptrans.cz" }, { label: "Mail", url: "mailto:a@b.cz" }],
      }),
    );
    expect(layout.name).toBe("Collections tariff");
    expect(layout.kgPerCbm).toBeNull();
    expect(layout.areas).toBeNull();
    expect(layout.matrices[0]).toMatchObject({ lastDataRow: null, volumeTo: null });
    expect(layout.regions).toMatchObject({ defaultCountry: "CZ", place: null });
    expect(layout.surcharges).toEqual([{ kind: "percent", label: "Fuel", overLengthCm: null, percent: 12, amount: null }]);
    expect(layout.links).toEqual([{ label: "Web", url: "https://www.toptrans.cz" }]);
  });
});

describe("collectionLayoutProblem", () => {
  const layout = parseCollectionLayout(AI_ANSWER);
  const sheets = [
    { name: "Ceník CZ-CZ", rowCount: 51 },
    { name: "Ceník CZ-SK", rowCount: 52 },
    { name: "Routing", rowCount: 11087 },
    { name: "Distance", rowCount: 12013 },
  ];

  it("is null when every sheet it names is there and long enough", () => {
    expect(collectionLayoutProblem(layout, sheets)).toBeNull();
  });

  it("names a missing sheet and what it was for", () => {
    expect(collectionLayoutProblem(layout, sheets.filter((s) => s.name !== "Distance"))).toBe('The file has no sheet "Distance" (the distance list)');
    expect(collectionLayoutProblem(layout, [{ name: "Ceník CZ-CZ", rowCount: 5 }, ...sheets.slice(1)])).toContain("has only 5 rows");
  });
});
