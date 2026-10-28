import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import type { CollectionLayout } from "../interfaces/interfaces";
import { convertCollection, numberIn, postcode5 } from "../lib/collectionConvert";
import { matrixFor, priceIn, volumeKg, zoneFor } from "../lib/collectionPricing";
import type { CellValue, Sheet } from "../lib/sheet";

const sheet = (name: string, rows: Record<number, Record<string, CellValue>>): Sheet => {
  const map = new Map(Object.entries(rows).map(([r, cells]) => [Number(r), cells]));
  return { name, rowCount: Math.max(...map.keys()), rows: map, links: [] };
};

// A TOPTRANS-like file: a CZ table (weight up to kg, volume up to m³, three distance zones), the
// postcode → region list and the distances between regions.
const PRICES = sheet("Ceník CZ-CZ", {
  13: { B: "do kg", C: "m3", E: "100 km", F: "200 km", G: "300 km" },
  14: { B: 5, C: 0.12, E: 160, F: 182, G: 226 },
  15: { B: 15, C: 0.2, E: 237, F: 277, G: 302 },
  16: { B: "do 30 kg", C: "0,3", E: "371", F: "436 Kč", G: 488 },
  17: { B: 150, C: 1.2, E: 1020, F: 1254, G: 1435 },
});
const ROUTING = sheet("Routing", {
  1: { A: "OBEC_NAZEV", B: "OBEC_PSC", C: "REGION_ID", D: "COUNTRY_ID" },
  2: { A: "Dobrovíz", B: "25261", C: 15, D: 1 },
  3: { A: "Brno", B: 60200, C: 58, D: 1 },
  4: { A: "Soľ", B: 9435, C: 175, D: 2 },
  5: { A: "Kovalovice", B: "25261", C: 59, D: 1 },
  6: { A: "nowhere", B: "abc", C: 1, D: 1 },
});
const DISTANCE = sheet("Distance", {
  1: { A: "ID_REGION1", B: "ID_REGION2", D: "DISTANCE" },
  2: { A: 15, B: 58, D: 206 },
  3: { A: 15, B: 15, D: 50 },
});

const LAYOUT: CollectionLayout = {
  name: "TOPTRANS",
  currency: "CZK",
  validFrom: "2026-01-01",
  validTo: null,
  zoneBy: "distance",
  matrices: [
    {
      label: "CZ → CZ",
      country: "CZ",
      sheet: "Ceník CZ-CZ",
      headerRow: 13,
      firstDataRow: 14,
      lastDataRow: null,
      weightTo: "B",
      volumeTo: "C",
      zones: ["E", "F", "G"].map((column, i) => ({ column, label: `${(i + 1) * 100} km`, kmTo: (i + 1) * 100, zone: null })),
    },
  ],
  kgPerCbm: null,
  regions: { sheet: "Routing", firstDataRow: 2, lastDataRow: null, postcode: "B", region: "C", country: "D", place: "A", countryCodes: { "1": "CZ", "2": "SK" }, defaultCountry: "CZ" },
  distances: { sheet: "Distance", firstDataRow: 2, lastDataRow: null, fromRegion: "A", toRegion: "B", km: "D" },
  sameRegionKm: 50,
  areas: null,
  surcharges: [{ kind: "oversize", label: "Oversize", overLengthCm: 350, percent: 50, amount: null }],
  conditions: [],
  links: [],
};

describe("numberIn and postcode5", () => {
  it("read numbers and postcodes as tariffs write them", () => {
    expect([numberIn(5), numberIn("do 5 kg"), numberIn("0,12 m3"), numberIn("1 500"), numberIn("x")]).toEqual([5, 5, 0.12, 1500, null]);
    expect([postcode5("252 61"), postcode5(60200), postcode5(9435), postcode5("abc")]).toEqual(["25261", "60200", "09435", null]);
  });
});

describe("convertCollection", () => {
  const { data, findings } = convertCollection([PRICES, ROUTING, DISTANCE], LAYOUT);

  it("reads every weight row with its volume and prices by zone", () => {
    expect(data.rates).toEqual([
      { matrix: 0, rowNo: 14, weightToKg: 5, volumeToCbm: 0.12, prices: [160, 182, 226] },
      { matrix: 0, rowNo: 15, weightToKg: 15, volumeToCbm: 0.2, prices: [237, 277, 302] },
      { matrix: 0, rowNo: 16, weightToKg: 30, volumeToCbm: 0.3, prices: [371, 436, 488] },
      { matrix: 0, rowNo: 17, weightToKg: 150, volumeToCbm: 1.2, prices: [1020, 1254, 1435] },
    ]);
  });

  it("reads the postcode list with countries by the tariff's codes, a number postcode padded to 5 digits", () => {
    expect(data.regions.map((r) => [r.postcode, r.region, r.country, r.place])).toEqual([
      ["25261", "15", "CZ", "Dobrovíz"],
      ["60200", "58", "CZ", "Brno"],
      ["09435", "175", "SK", "Soľ"],
      ["25261", "59", "CZ", "Kovalovice"],
    ]);
    expect(data.distances).toEqual([
      { fromRegion: "15", toRegion: "58", km: 206 },
      { fromRegion: "15", toRegion: "15", km: 50 },
    ]);
  });

  it("warns of a row it cannot read, a postcode in two regions, and a table no postcode is in", () => {
    expect(findings.map((f) => [f.level, f.code, f.count])).toEqual([
      ["warning", "region_row_unreadable", 1],
      ["warning", "postcode_in_two_regions", 1],
    ]);
    // The sheet row where 252 61 comes again in another region, not the postcode.
    expect(findings.find((f) => f.code === "postcode_in_two_regions")!.rows).toEqual([5]);
    const sk = convertCollection([PRICES, ROUTING, DISTANCE], { ...LAYOUT, matrices: [{ ...LAYOUT.matrices[0]!, label: "CZ → PL", country: "PL" }] });
    expect(sk.findings.map((f) => f.code)).toContain("matrix_country_unused");
  });

  it("stops approval when weights do not grow or a price is no number", () => {
    const bad = sheet("Ceník CZ-CZ", { 13: { B: "do kg" }, 14: { B: 15, E: 160, F: 182, G: 226 }, 15: { B: 5, E: "on request?", F: 1, G: 1 } });
    const { findings: f } = convertCollection([bad, ROUTING, DISTANCE], LAYOUT);
    expect(f.filter((x) => x.level === "error").map((x) => x.code)).toEqual(["weight_not_increasing", "price_not_number"]);
  });

  it("reads postcode areas, a prefix such as 1xxxx as its range", () => {
    const areas = sheet("Zones", { 1: { A: "PSČ", B: "Zone" }, 2: { A: "1xxxx", B: 1 }, 3: { A: "60200", B: 3 } });
    const { data: d } = convertCollection([PRICES, areas], {
      ...LAYOUT,
      zoneBy: "postcode",
      regions: null,
      distances: null,
      areas: { sheet: "Zones", firstDataRow: 2, lastDataRow: null, postcodeFrom: "A", postcodeTo: null, zone: "B", country: null, defaultCountry: "CZ" },
    });
    expect(d.areas).toEqual([
      { rowNo: 2, postcodeFrom: "10000", postcodeTo: "19999", zone: "1", country: "CZ" },
      { rowNo: 3, postcodeFrom: "60200", postcodeTo: "60200", zone: "3", country: "CZ" },
    ]);
  });
});

describe("pricing", () => {
  const { data } = convertCollection([PRICES, ROUTING, DISTANCE], LAYOUT);
  const at = (consignment: { weightKg: number | null; cbm: number | null; longestCm: number | null }, km = 206) =>
    priceIn(LAYOUT, data.rates, 0, zoneFor(LAYOUT, 0, { km }), consignment, km);

  it("counts a volume as the weight of the first row it fits, by the tariff's own column", () => {
    expect([volumeKg(data.rates, null, 0.05), volumeKg(data.rates, null, 0.12), volumeKg(data.rates, null, 0.5), volumeKg(data.rates, null, 2)]).toEqual([5, 5, 150, Infinity]);
    expect(volumeKg([{ matrix: 0, weightToKg: 100, volumeToCbm: null, prices: [] }], 250, 0.5)).toBe(125);
  });

  it("prices the heavier of the real weight and the volume, in the zone the distance falls in", () => {
    expect(at({ weightKg: 120, cbm: 0.3, longestCm: 120 })).toMatchObject({ ok: true, zoneLabel: "300 km", chargeableKg: 120, chargeableBy: "weight", bandLabel: "up to 150 kg", price: 1435, total: 1435 });
    expect(at({ weightKg: 3, cbm: 0.18, longestCm: null }, 50)).toMatchObject({ ok: true, zoneLabel: "100 km", chargeableKg: 15, chargeableBy: "volume", price: 237 });
  });

  it("adds the oversize surcharge for a piece over its length, in whole units like the table", () => {
    expect(at({ weightKg: 120, cbm: 0.3, longestCm: 360 })).toMatchObject({ price: 1435, surcharges: [{ label: "Oversize", amount: 718 }], total: 2153 });
  });

  it("adds % and flat surcharges always", () => {
    const layout = { ...LAYOUT, surcharges: [{ kind: "percent" as const, label: "Fuel", overLengthCm: null, percent: 10, amount: null }, { kind: "flat" as const, label: "Toll", overLengthCm: null, percent: null, amount: 25 }] };
    expect(priceIn(layout, data.rates, 0, 0, { weightKg: 4, cbm: null, longestCm: null }, 50)).toMatchObject({ price: 160, surcharges: [{ amount: 16 }, { amount: 25 }], total: 201 });
  });

  it("refuses a consignment over the heaviest row or the largest volume, or with neither weight nor volume", () => {
    expect(at({ weightKg: 151, cbm: null, longestCm: null })).toEqual({ ok: false, reason: "too_heavy", chargeableKg: 151, maxKg: 150 });
    expect(at({ weightKg: 10, cbm: 5, longestCm: null })).toEqual({ ok: false, reason: "too_big" });
    expect(at({ weightKg: null, cbm: null, longestCm: null })).toEqual({ ok: false, reason: "no_weight" });
  });

  it("finds the table by country and the zone by km or code", () => {
    expect([matrixFor(LAYOUT, "CZ"), matrixFor(LAYOUT, "SK")]).toEqual([0, -1]);
    expect([zoneFor(LAYOUT, 0, { km: 100 }), zoneFor(LAYOUT, 0, { km: 101 }), zoneFor(LAYOUT, 0, { km: 301 })]).toEqual([0, 1, -1]);
  });
});
