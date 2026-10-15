import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { bigChanges, postcodeGaps, validateVersion, type ValidationContext } from "../lib/tariffValidation";
import { activationPlan, cleanRateRequest, cleanTariffCreate, cleanTariffUpdate, cleanVersionInput, versionLevels, versionStatus } from "../lib/tariffRules";
import type { RateRequest, TariffVersionInput } from "../interfaces/interfaces";

// A clean version: covers 100 00–799 99, contiguous bands, faster levels dearer, rising prices.
const input = (over: Partial<TariffVersionInput> = {}): TariffVersionInput => ({
  validFrom: "2026-11-01",
  validTo: null,
  factors: { kgPerLdm: 1750, kgPerCbm: 250, kgPerPalletPlace: 400 },
  rounding: { weightStepKg: 1, moneyStep: 0.01 },
  zones: [
    { code: "1", label: "West", postcodeFrom: "10000", postcodeTo: "49999", remote: false },
    { code: "2", label: "East", postcodeFrom: "50000", postcodeTo: "79999", remote: false },
    { code: "2R", label: "Šumava", postcodeFrom: "53000", postcodeTo: "53099", remote: true },
  ],
  bands: [
    { id: "b1", basis: "KG", fromExcl: 0, toIncl: 100 },
    { id: "b2", basis: "KG", fromExcl: 100, toIncl: null },
  ],
  rates: [
    { serviceLevel: "D1", zoneCode: "1", bandId: "b1", amount: 600, priceType: "FLAT" },
    { serviceLevel: "D1", zoneCode: "1", bandId: "b2", amount: 900, priceType: "FLAT" },
    { serviceLevel: "D2", zoneCode: "1", bandId: "b1", amount: 500, priceType: "FLAT" },
    { serviceLevel: "D2", zoneCode: "1", bandId: "b2", amount: 800, priceType: "FLAT" },
  ],
  minCharges: [{ serviceLevel: "D1", zoneCode: "1", amount: 400 }],
  surcharges: [],
  notes: "",
  ...over,
});

const ctx: ValidationContext = { fuelMonthCount: 1, activeInput: null };
const messages = (v: TariffVersionInput, c = ctx) => validateVersion(v, c).map((f) => `${f.severity}: ${f.message} @ ${f.where}`);

describe("validation findings", () => {
  it("finds nothing in a clean version", () => {
    expect(validateVersion(input(), ctx)).toEqual([]);
  });

  it("refuses zone ranges that cross or repeat, but lets them nest", () => {
    const zones = [
      ...input().zones,
      { code: "3", label: "", postcodeFrom: "45000", postcodeTo: "55000", remote: false },
      { code: "4", label: "", postcodeFrom: "53000", postcodeTo: "53099", remote: false },
      { code: "1", label: "", postcodeFrom: "11000", postcodeTo: "11999", remote: false },
    ];
    const found = messages(input({ zones }));
    expect(found).toContain("error: Zones 1 (100 00–499 99) and 3 (450 00–550 00) overlap @ Zone 3");
    expect(found).toContain("error: Zones 2R and 4 have the same postcode range 530 00–530 99 @ Zone 4");
    expect(found).toContain("error: Zone code 1 is used twice @ Zone 1");
    expect(found.filter((f) => f.includes("2R") && f.includes("overlap"))).toEqual([]);
  });

  it("refuses rates on unknown zones and bands, and non-numeric or negative prices", () => {
    const rates = [
      ...input().rates,
      { serviceLevel: "D3" as const, zoneCode: "9", bandId: "b1", amount: 100, priceType: "FLAT" as const },
      { serviceLevel: "D3" as const, zoneCode: "1", bandId: "bx", amount: 100, priceType: "FLAT" as const },
      { serviceLevel: "D4" as const, zoneCode: "1", bandId: "b1", amount: NaN, priceType: "FLAT" as const },
      { serviceLevel: "D4" as const, zoneCode: "1", bandId: "b2", amount: -5, priceType: "FLAT" as const },
    ];
    expect(messages(input({ rates }))).toEqual(
      expect.arrayContaining([
        "error: Unknown zone 9 @ Sheet D3, zone 9, band 1–100 kg",
        "error: Unknown band bx @ Sheet D3, zone 1, band bx",
        "error: The price is not a number @ Sheet D4, zone 1, band 1–100 kg",
        "error: The price is negative @ Sheet D4, zone 1, band over 100 kg",
      ]),
    );
  });

  it("refuses bands that leave a gap, overlap, or follow an open band", () => {
    const gap = messages(input({ bands: [{ id: "b1", basis: "KG", fromExcl: 0, toIncl: 100 }, { id: "b2", basis: "KG", fromExcl: 150, toIncl: null }] }));
    expect(gap).toContain("error: Gap after band 1–100 kg: nothing prices 100–150 @ Bands KG, over 150 kg");
    const overlap = messages(input({ bands: [{ id: "b1", basis: "KG", fromExcl: 0, toIncl: 100 }, { id: "b2", basis: "KG", fromExcl: 80, toIncl: null }] }));
    expect(overlap).toContain("error: Overlaps band 1–100 kg @ Bands KG, over 80 kg");
    const open = messages(input({ bands: [{ id: "b1", basis: "KG", fromExcl: 0, toIncl: null }, { id: "b2", basis: "KG", fromExcl: 100, toIncl: 200 }] }));
    expect(open.some((f) => f.startsWith("error: Band over 0 kg is open at the top"))).toBe(true);
    // bands of another basis are judged on their own
    const pallets = input({ bands: [...input().bands, { id: "p1", basis: "PALLET", fromExcl: 0, toIncl: 3 }] });
    expect(validateVersion(pallets, ctx)).toEqual([]);
  });

  it("refuses valid-from after valid-to, and bad factors or rounding", () => {
    expect(messages(input({ validTo: "2026-10-01" }))).toContain("error: Valid from is after valid to @ Validity");
    expect(messages(input({ factors: { kgPerLdm: 0, kgPerCbm: 250, kgPerPalletPlace: 400 } }))).toContain("error: Kg per loading metre must be a number above 0 @ Chargeable weight factors");
    expect(messages(input({ rounding: { weightStepKg: 1, moneyStep: 0 } }))).toContain("error: The money rounding step must be above 0 @ Rounding");
  });

  it("refuses a sheet that mixes band bases", () => {
    const v = input({
      bands: [...input().bands, { id: "p1", basis: "PALLET", fromExcl: 0, toIncl: null }],
      rates: [...input().rates, { serviceLevel: "D1", zoneCode: "2", bandId: "p1", amount: 700, priceType: "PER_UNIT" }],
    });
    expect(messages(v)).toContain("error: Mixes bands of KG and PALLET; a sheet is priced on one basis @ Sheet D1");
  });

  it("warns when a flat price falls as the band rises", () => {
    const rates = input().rates.map((r) => (r.serviceLevel === "D2" && r.bandId === "b2" ? { ...r, amount: 450 } : r));
    expect(messages(input({ rates }))).toContain("warning: The price falls from 500 to 450 as the band rises @ Sheet D2, zone 1, band over 100 kg");
  });

  it("warns when a slower level is dearer than a faster one, once per pair of levels", () => {
    const rates = input().rates.map((r) => (r.serviceLevel === "D2" ? { ...r, amount: r.amount + 500 } : r));
    expect(messages(input({ rates }))).toEqual(["warning: D2 costs 1 000, more than the faster D1 at 600 (and 1 more cells) @ Sheet D2, zone 1, band 1–100 kg"]);
  });

  it("lists the postcodes no zone covers", () => {
    const zones = [
      { code: "1", label: "", postcodeFrom: "11000", postcodeTo: "19999", remote: false },
      { code: "2", label: "", postcodeFrom: "30000", postcodeTo: "79000", remote: false },
    ];
    expect(postcodeGaps({ zones })).toEqual([["10000", "10999"], ["20000", "29999"], ["79001", "79999"]]);
    expect(messages(input({ zones, rates: [], minCharges: [] }))).toEqual([
      "warning: Postcodes 100 00–109 99 are in no zone @ Zones",
      "warning: Postcodes 200 00–299 99 are in no zone @ Zones",
      "warning: Postcodes 790 01–799 99 are in no zone @ Zones",
    ]);
    expect(postcodeGaps({ zones: [] })).toEqual([["10000", "79999"]]);
  });

  it("warns about a fuel-index surcharge when no fuel index is set", () => {
    const v = input({ surcharges: [{ code: "FUEL", calc: "FUEL_INDEX", value: 0, min: null, onBasePlusSurcharges: false }] });
    expect(messages(v, { fuelMonthCount: 0, activeInput: null })).toEqual(["warning: A surcharge follows the fuel index, but no fuel index month is set: it will be 0 % @ Surcharges"]);
    expect(messages(v)).toEqual([]);
  });

  it("counts prices that move more than 15 % against the active version", () => {
    const active = input();
    const next = input({ rates: active.rates.map((r, i) => ({ ...r, amount: i < 2 ? r.amount * 1.2 : r.amount * 1.1 })) });
    expect(bigChanges(next, active)).toBe(2);
    expect(messages(next, { fuelMonthCount: 1, activeInput: active })).toEqual(["warning: 2 prices change by more than 15 % against the active version @ Rates"]);
  });
});

describe("version input cleaning", () => {
  it("normalises postcodes and keeps bad numbers for the findings", () => {
    const raw = input({
      zones: [{ code: " 1 ", label: "x", postcodeFrom: "100 00", postcodeTo: "abc", remote: true }],
      rates: [{ serviceLevel: "D1", zoneCode: "1", bandId: "b1", amount: "12" as unknown as number, priceType: "FLAT" }],
    });
    const out = cleanVersionInput(raw);
    expect(out.zones[0]).toEqual({ code: "1", label: "x", postcodeFrom: "10000", postcodeTo: "abc", remote: true });
    expect(out.rates[0].amount).toBeNaN();
    expect(versionLevels(out)).toEqual(["D1"]);
  });

  it("refuses what cannot be stored: unknown codes or a missing date", () => {
    expect(() => cleanVersionInput(input({ validFrom: "2026-02-30" }))).toThrow("Valid from must be a date like 2026-12-31");
    expect(() => cleanVersionInput(input({ rates: [{ serviceLevel: "D9" as never, zoneCode: "1", bandId: "b1", amount: 1, priceType: "FLAT" }] }))).toThrow(/Rate 1: the service level/);
    expect(() => cleanVersionInput(input({ bands: [{ id: "x", basis: "M3" as never, fromExcl: 0, toIncl: null }] }))).toThrow(/Band 1: the basis/);
  });
});

describe("tariff rules", () => {
  const create = { side: "SELL" as const, scope: "LTL" as const, mode: "MATRIX" as const, name: " Standard LTL ", ownerCustomerId: null, currency: "CZK" as const, zoneBy: "DESTINATION" as const, discountPercent: 5 };
  const C = "00000000-0000-0000-0000-0000000000c1";

  it("accepts a Standard sell list and drops a stray discount", () => {
    expect(cleanTariffCreate(create)).toMatchObject({ name: "Standard LTL", ownerCustomerId: null, discountPercent: null });
  });

  it("needs a haulier on BUY, no owner on INTERNAL, and a customer for a DISCOUNT", () => {
    expect(() => cleanTariffCreate({ ...create, side: "BUY" })).toThrow("A buy tariff belongs to a haulier: choose one");
    expect(() => cleanTariffCreate({ ...create, side: "INTERNAL", ownerCustomerId: C })).toThrow("The internal tariff has no owner");
    expect(() => cleanTariffCreate({ ...create, mode: "DISCOUNT" })).toThrow("Only a customer's sell tariff can be a discount off the Standard list");
    expect(cleanTariffCreate({ ...create, mode: "DISCOUNT", ownerCustomerId: C, discountPercent: -3 })).toMatchObject({ mode: "DISCOUNT", discountPercent: -3 });
    expect(() => cleanTariffCreate({ ...create, mode: "DISCOUNT", ownerCustomerId: C, discountPercent: 100 })).toThrow(/discount/);
    expect(() => cleanTariffUpdate({ discountPercent: 4 }, "MATRIX")).toThrow("Only a discount tariff has a discount");
  });

  it("derives the status of a version on a day", () => {
    const at = new Date();
    const v = (over: object) => ({ validFrom: "2026-10-01", validTo: null, activatedAt: at, supersededAt: null, ...over });
    expect(versionStatus(v({ activatedAt: null }), "2026-10-15")).toBe("DRAFT");
    expect(versionStatus(v({}), "2026-10-15")).toBe("ACTIVE");
    expect(versionStatus(v({ validFrom: "2026-11-01" }), "2026-10-15")).toBe("SCHEDULED");
    expect(versionStatus(v({ validTo: "2026-10-14" }), "2026-10-15")).toBe("EXPIRED");
    expect(versionStatus(v({ validTo: "2026-10-15" }), "2026-10-15")).toBe("ACTIVE");
    expect(versionStatus(v({ supersededAt: at, validFrom: "2026-11-01" }), "2026-10-15")).toBe("SUPERSEDED");
  });

  it("plans an activation: the running version ends the day before, later ones are superseded", () => {
    const binding = [
      { id: "old", validFrom: "2026-01-01", validTo: "2026-06-30" },
      { id: "running", validFrom: "2026-07-01", validTo: null },
      { id: "scheduled", validFrom: "2026-12-01", validTo: null },
      { id: "same-day", validFrom: "2026-11-01", validTo: null },
    ];
    expect(activationPlan(binding, "2026-11-01")).toEqual({ close: [{ id: "running", validTo: "2026-10-31" }], supersede: ["scheduled", "same-day"] });
    expect(activationPlan([], "2026-11-01")).toEqual({ close: [], supersede: [] });
  });
});

describe("rate request", () => {
  const req = (over: Partial<RateRequest> = {}): RateRequest => ({
    fromPostcode: "110 00",
    toPostcode: " 602 00 ",
    pickupDate: "2026-10-15",
    pickupTime: null,
    scope: "LTL",
    pieces: 1,
    palletPlaces: 1,
    ldm: 0,
    weightKg: 300,
    cbm: 0,
    extras: { adr: false, tailLift: false, avizace: false, timeWindow: false, b2c: false, nonStackable: false, waitingHours: 0, declaredValueCzk: null },
    customerId: null,
    serviceLevels: null,
    includeBuy: true,
    includeInternal: false,
    ...over,
  });

  it("normalises the postcodes", () => {
    expect(cleanRateRequest(req())).toMatchObject({ fromPostcode: "11000", toPostcode: "60200" });
  });

  it("refuses a bad postcode, time, level or an empty shipment", () => {
    expect(() => cleanRateRequest(req({ toPostcode: "D-10115" }))).toThrow("The delivery postcode must be a CZ postcode, 5 digits like 110 00");
    expect(() => cleanRateRequest(req({ pickupTime: "25:00" }))).toThrow("The pickup time must be a time like 14:30");
    expect(() => cleanRateRequest(req({ serviceLevels: ["D7" as never] }))).toThrow(/A service level must be/);
    expect(() => cleanRateRequest(req({ weightKg: 0, palletPlaces: 0 }))).toThrow("Give the weight, loading metres, cubic metres or pallet places");
    expect(() => cleanRateRequest(req({ weightKg: -1 }))).toThrow("The weight must be a number, 0 or more");
  });
});
