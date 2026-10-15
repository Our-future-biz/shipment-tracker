import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
import { describeSurcharge, diffVersions, MAX_DIFF_CELLS, surchargeChanges } from "../lib/tariffDiff";
import type { TariffRate, TariffVersionInput, TariffVersionSummary } from "../interfaces/interfaces";

const input = (over: Partial<TariffVersionInput> = {}): TariffVersionInput => ({
  validFrom: "2026-11-01",
  validTo: null,
  factors: { kgPerLdm: 1750, kgPerCbm: 250, kgPerPalletPlace: 400 },
  rounding: { weightStepKg: 1, moneyStep: 0.01 },
  zones: [
    { code: "1", label: "Praha", postcodeFrom: "10000", postcodeTo: "19999", remote: false },
    { code: "2", label: "Rest", postcodeFrom: "20000", postcodeTo: "79999", remote: false },
  ],
  bands: [
    { id: "b1", basis: "KG", fromExcl: 0, toIncl: 100 },
    { id: "b2", basis: "KG", fromExcl: 100, toIncl: null },
  ],
  rates: [
    { serviceLevel: "D1", zoneCode: "1", bandId: "b1", amount: 400, priceType: "FLAT" },
    { serviceLevel: "D1", zoneCode: "2", bandId: "b1", amount: 500, priceType: "FLAT" },
    { serviceLevel: "D1", zoneCode: "1", bandId: "b2", amount: 300, priceType: "PER_100KG" },
    { serviceLevel: "D1", zoneCode: "2", bandId: "b2", amount: 350, priceType: "PER_100KG" },
  ],
  minCharges: [{ serviceLevel: "D1", zoneCode: "1", amount: 350 }],
  surcharges: [{ code: "FUEL", calc: "PCT", value: 12, min: null, onBasePlusSurcharges: false }],
  notes: "",
  ...over,
});

const against = { id: "v1", versionNo: 1 } as TariffVersionSummary;
const rate = (r: Partial<TariffRate>): TariffRate => ({ serviceLevel: "D1", zoneCode: "1", bandId: "b1", amount: 1, priceType: "FLAT", ...r });

describe("diffVersions", () => {
  it("is empty when there is nothing to compare with", () => {
    const d = diffVersions(input(), null, null);
    expect(d).toMatchObject({ against: null, changedCells: 0, addedCells: 0, cells: [], averageChangePercent: null, affectedOpenQuotes: null, affectedOpenConsignments: null });
  });

  it("finds nothing between a version and its copy with other band ids", () => {
    const prev = input();
    const next = input({
      bands: [
        { id: "x2", basis: "KG", fromExcl: 100, toIncl: null },
        { id: "x1", basis: "KG", fromExcl: 0, toIncl: 100 },
      ],
      rates: prev.rates.map((r) => ({ ...r, bandId: r.bandId === "b1" ? "x1" : "x2" })),
    });
    const d = diffVersions(next, prev, against);
    expect(d).toMatchObject({ against, changedCells: 0, addedCells: 0, removedCells: 0, unchangedCells: 5, averageChangePercent: 0, cells: [] });
    expect(d.surchargeChanges).toEqual([]);
  });

  it("counts changed, added and removed cells with their percents, largest change first", () => {
    const prev = input();
    const next = input({
      rates: [
        rate({ zoneCode: "1", bandId: "b1", amount: 440 }), // +10 %
        rate({ zoneCode: "2", bandId: "b1", amount: 400 }), // −20 %
        rate({ zoneCode: "1", bandId: "b2", amount: 300, priceType: "PER_100KG" }), // same
        rate({ serviceLevel: "D2", zoneCode: "1", bandId: "b1", amount: 380 }), // added
      ],
      minCharges: [{ serviceLevel: "D1", zoneCode: "1", amount: 385 }], // +10 %
    });
    const d = diffVersions(next, prev, against);
    expect(d).toMatchObject({
      changedCells: 3,
      addedCells: 1,
      removedCells: 1,
      unchangedCells: 1,
      maxIncreasePercent: 10,
      maxDecreasePercent: -20,
      levelsAdded: ["D2"],
      levelsRemoved: [],
    });
    // average over the cells priced in both: (10 − 20 + 0 + 10) / 4
    expect(d.averageChangePercent).toBe(0);
    expect(d.cells).toEqual([
      { serviceLevel: "D1", zoneCode: "2", bandLabel: "1–100 kg", before: 500, after: 400, changePercent: -20 },
      { serviceLevel: "D1", zoneCode: "1", bandLabel: "Minimum charge", before: 350, after: 385, changePercent: 10 },
      { serviceLevel: "D1", zoneCode: "1", bandLabel: "1–100 kg", before: 400, after: 440, changePercent: 10 },
      { serviceLevel: "D2", zoneCode: "1", bandLabel: "1–100 kg", before: null, after: 380, changePercent: null },
      { serviceLevel: "D1", zoneCode: "2", bandLabel: "over 100 kg (per 100 kg)", before: 350, after: null, changePercent: null },
    ]);
  });

  it("puts a change from 0 first, with no percent", () => {
    const prev = input({ rates: [rate({ amount: 0 }), rate({ zoneCode: "2", amount: 100 })], minCharges: [] });
    const next = input({ rates: [rate({ amount: 50 }), rate({ zoneCode: "2", amount: 200 })], minCharges: [] });
    const d = diffVersions(next, prev, against);
    expect(d.cells.map((c) => [c.zoneCode, c.changePercent])).toEqual([
      ["1", null],
      ["2", 100],
    ]);
    expect(d.averageChangePercent).toBe(100);
  });

  it("treats a changed price type as a removed and an added cell", () => {
    const prev = input({ rates: [rate({ amount: 400 })] });
    const next = input({ rates: [rate({ amount: 4, priceType: "PER_UNIT" })] });
    const d = diffVersions(next, prev, against);
    expect([d.changedCells, d.addedCells, d.removedCells]).toEqual([0, 1, 1]);
    expect(d.cells.map((c) => c.bandLabel)).toEqual(["1–100 kg (per unit)", "1–100 kg"]);
  });

  it("lists zones and levels added and removed", () => {
    const prev = input();
    const next = input({
      zones: [prev.zones[0], { code: "3", label: "New", postcodeFrom: "20000", postcodeTo: "79999", remote: false }],
      rates: [rate({ serviceLevel: "D2", amount: 1 })],
    });
    const d = diffVersions(next, prev, against);
    expect(d).toMatchObject({ zonesAdded: ["3"], zonesRemoved: ["2"], levelsAdded: ["D2"], levelsRemoved: ["D1"] });
  });

  it("returns at most 500 cells", () => {
    const bands = Array.from({ length: 30 }, (_, i) => ({ id: `b${i}`, basis: "KG" as const, fromExcl: i * 10, toIncl: i * 10 + 10 }));
    const zones = Array.from({ length: 20 }, (_, i) => ({ code: `Z${i}`, label: "", postcodeFrom: "10000", postcodeTo: "10000", remote: false }));
    const rates = (amount: number) => bands.flatMap((b) => zones.map((z) => rate({ zoneCode: z.code, bandId: b.id, amount })));
    const d = diffVersions(input({ bands, zones, rates: rates(110), minCharges: [] }), input({ bands, zones, rates: rates(100), minCharges: [] }), against);
    expect(d.changedCells).toBe(600);
    expect(d.cells).toHaveLength(MAX_DIFF_CELLS);
  });
});

describe("surcharge changes", () => {
  it("describes each calculation", () => {
    expect(describeSurcharge({ code: "FUEL", calc: "PCT", value: 12, min: null, onBasePlusSurcharges: false })).toBe("12 %");
    expect(describeSurcharge({ code: "FUEL", calc: "FUEL_INDEX", value: 0, min: 100, onBasePlusSurcharges: true })).toBe("fuel index of freight + surcharges, min 100");
    expect(describeSurcharge({ code: "B2C", calc: "PER_KG", value: 0.5, min: null, onBasePlusSurcharges: false })).toBe("0.5 per kg");
    expect(describeSurcharge({ code: "INSURANCE", calc: "PCT_OF_VALUE", value: 0.3, min: null, onBasePlusSurcharges: false })).toBe("0.3 % of the value");
  });

  it("lists new, changed and removed surcharges in plain English", () => {
    const changes = surchargeChanges(
      [
        { code: "FUEL", calc: "FUEL_INDEX", value: 0, min: null, onBasePlusSurcharges: false },
        { code: "ADR", calc: "FLAT", value: 350, min: null, onBasePlusSurcharges: false },
        { code: "B2C", calc: "FLAT", value: 150, min: null, onBasePlusSurcharges: false },
      ],
      [
        { code: "FUEL", calc: "PCT", value: 12, min: null, onBasePlusSurcharges: false },
        { code: "B2C", calc: "FLAT", value: 150, min: null, onBasePlusSurcharges: false },
        { code: "TOLL", calc: "PCT", value: 4, min: null, onBasePlusSurcharges: false },
      ],
    );
    expect(changes).toEqual(["Fuel surcharge: 12 % → fuel index", "ADR (dangerous goods): new, 350 flat", "Toll: removed"]);
  });
});
