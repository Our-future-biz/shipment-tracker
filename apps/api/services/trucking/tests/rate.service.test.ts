import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The rate service runs for real against stand-ins for the repositories, the settings, the fuel
// index and the customers / fx / holidays services.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  customers: { _internalHaulierList: vi.fn(), _internalCustomerPipelineList: vi.fn() },
  fx: { fxResolve: vi.fn() },
  holidays: { _internalHolidaysCzNational: vi.fn() },
}));
const tariffs = vi.hoisted(() => ({ list: vi.fn(), bindingOn: vi.fn() }));
vi.mock("../repositories/tariff.repository", () => ({ tariffRepository: tariffs }));
const gaps = vi.hoisted(() => ({ record: vi.fn(async () => undefined) }));
vi.mock("../repositories/rateGap.repository", () => ({ rateGapRepository: gaps }));
const hauliers = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("../repositories/portal.repository", () => ({ portalRepository: { revokeSessionsOfHaulier: vi.fn(async () => undefined) } }));
vi.mock("../repositories/haulier.repository", () => ({ haulierRepository: hauliers }));
const settings = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../services/settings.service", () => ({ settingsService: settings }));
const fuel = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../services/fuelIndex.service", () => ({ fuelIndexService: fuel }));
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "") }));

import { customers, fx, holidays } from "~encore/clients";
import { rateService } from "../services/rate.service";
import { DEFAULT_SETTINGS } from "../lib/settingsRules";
import type { PricedSide, RateRequest, TariffVersionInput, Unpriced } from "../interfaces/interfaces";

const C = "00000000-0000-0000-0000-000000000001";
const CUST = "00000000-0000-0000-0000-0000000000c1";
const H1 = "00000000-0000-0000-0000-0000000000a1";
const H2 = "00000000-0000-0000-0000-0000000000a2";
const H3 = "00000000-0000-0000-0000-0000000000a3";
const GONE = "00000000-0000-0000-0000-0000000000a9";
const CUST2 = "00000000-0000-0000-0000-0000000000c2";
const NOBODY = "00000000-0000-0000-0000-0000000000c3";

const tariff = (id: string, over: object = {}) => ({
  id,
  companyId: C,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  side: "BUY",
  scope: "LTL",
  mode: "MATRIX",
  name: `Tariff ${id}`,
  ownerCustomerId: null,
  currency: "CZK",
  zoneBy: "DESTINATION",
  discountPercent: null,
  ...over,
});

/** One zone for all of CZ, one open KG band, D1 at `perKg` per kg. */
const prices = (perKg: number): TariffVersionInput => ({
  validFrom: "2026-01-01",
  validTo: null,
  factors: { kgPerLdm: 1750, kgPerCbm: 250, kgPerPalletPlace: 400 },
  rounding: { weightStepKg: 1, moneyStep: 0.01 },
  zones: [{ code: "CZ", label: "Czechia", postcodeFrom: "10000", postcodeTo: "79999", remote: false }],
  bands: [{ id: "b", basis: "KG", fromExcl: 0, toIncl: null }],
  rates: [{ serviceLevel: "D1", zoneCode: "CZ", bandId: "b", amount: perKg, priceType: "PER_UNIT" }],
  minCharges: [],
  surcharges: [],
  notes: "",
});

const version = (tariffId: string, perKg: number) => ({ id: `v-${tariffId}`, tariffId, versionNo: 1, input: prices(perKg) });

const profile = (customerId: string, over: object = {}, lanes: object[] = []) => ({
  profile: {
    id: `p-${customerId}`,
    companyId: C,
    customerId,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    insurer: "Kooperativa",
    insurancePolicyNo: "P",
    insuranceLimit: 300000,
    insuranceCurrency: "EUR",
    insuranceValidTo: "2027-06-30",
    licenceNo: "K",
    licenceValidTo: null,
    licenceUnlimited: true,
    adrCapable: false,
    vehicleTypes: [],
    paymentDays: 30,
    currency: "CZK",
    vatUnreliable: false,
    bankAccountPublished: true,
    vatCheckedAt: "2026-10-10",
    costSplitBasis: "chargeable_weight",
    blocked: false,
    blockReason: "",
    blockedAt: null,
    blockedBy: null,
    notes: "",
    version: 1,
    ...over,
  },
  lanes,
});

const lane = { id: "l1", originPostcodeFrom: "10000", originPostcodeTo: "19999", destPostcodeFrom: "60000", destPostcodeTo: "69999", serviceKind: "ANY", note: "" };

const request = (over: Partial<RateRequest> = {}): RateRequest => ({
  fromPostcode: "110 00",
  toPostcode: "602 00",
  pickupDate: "2026-10-15",
  pickupTime: "09:00",
  scope: "LTL",
  pieces: 1,
  palletPlaces: 0,
  ldm: 0,
  weightKg: 300,
  cbm: 0,
  extras: { adr: false, tailLift: false, avizace: false, timeWindow: false, b2c: false, nonStackable: false, waitingHours: 0, declaredValueCzk: null },
  customerId: null,
  serviceLevels: ["D1"],
  includeBuy: true,
  includeInternal: true,
  ...over,
});

const isPriced = (s: PricedSide | Unpriced | null): s is PricedSide => !!s && "total" in s;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
  fuel.list.mockResolvedValue([]);
  settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS, version: 0, updatedAt: null, updatedBy: null });
  tariffs.list.mockResolvedValue([
    tariff("std", { side: "SELL", name: "Standard LTL" }),
    tariff("cust", { side: "SELL", mode: "DISCOUNT", ownerCustomerId: CUST, name: "Acme LTL", discountPercent: 10 }),
    tariff("h1", { ownerCustomerId: H1 }),
    tariff("h2", { ownerCustomerId: H2, currency: "EUR" }),
    tariff("h3", { ownerCustomerId: H3 }),
    tariff("gone", { ownerCustomerId: GONE }),
  ]);
  tariffs.bindingOn.mockResolvedValue([version("std", 10), version("h1", 6), version("h2", 0.2), version("h3", 4), version("gone", 1)]);
  hauliers.findMany.mockResolvedValue([profile(H1), profile(H2), profile(H3, { blocked: true, blockReason: "Late twice" })]);
  vi.mocked(customers._internalHaulierList).mockResolvedValue({
    hauliers: [H1, H2, H3].map((id, i) => ({ id, companyName: ["Alfa", "Bravo", "Cyril"][i], ico: "", dic: "", city: "", country: "CZ" })),
  });
  vi.mocked(customers._internalCustomerPipelineList).mockResolvedValue({ data: [{ id: CUST, companyName: "Acme s.r.o." }] } as never);
  vi.mocked(fx.fxResolve).mockResolvedValue({ currency: "EUR", date: "2026-10-15", rate: 25, fixingDate: "2026-10-15", carried: false, provisional: false, missing: false, roePct: 0, reason: "" });
  vi.mocked(holidays._internalHolidaysCzNational).mockResolvedValue({ dates: [] });
});

afterEach(() => vi.useRealTimers());

describe("rate calculator", () => {
  it("prices sell on the Standard list, buy cheapest first in CZK, and leaves blocked hauliers out", async () => {
    const res = await rateService.rate(C, request());
    expect(tariffs.list).toHaveBeenCalledWith(C, { scope: "LTL" });
    expect(tariffs.bindingOn.mock.calls[0][2]).toBe("2026-10-15");
    const [d1] = res.results;
    expect(d1).toMatchObject({ serviceLevel: "D1", label: "+1 day", promisedDate: "2026-10-16" });
    expect(isPriced(d1.sell) && d1.sell).toMatchObject({ tariffName: "Standard LTL", total: 3000, totalCzk: 3000 });
    // Bravo: 300 kg × 0.20 EUR = 60 EUR = 1 500 CZK; Alfa: 300 × 6 = 1 800 CZK
    expect(d1.buy.map((b) => [b.ownerName, b.total, b.totalCzk, b.preferred])).toEqual([
      ["Bravo", 60, 1500, false],
      ["Alfa", 1800, 1800, false],
    ]);
    expect(d1.buy[0].fx).toEqual({ rate: 25, date: "2026-10-15" });
    expect(d1.excluded).toEqual([{ customerId: H3, name: "Cyril", issues: [expect.objectContaining({ code: "blocked", message: "Blocked: Late twice" })] }]);
    expect(d1).toMatchObject({ marginCzk: 1500, marginPercent: 50, belowFloor: false });
    expect(d1.internal).toEqual({ reason: "No internal LTL tariff" });
    expect(fx.fxResolve).toHaveBeenCalledWith({ currency: "EUR", date: "2026-10-15" });
  });

  it("puts a haulier with a preferred lane first, even when dearer", async () => {
    hauliers.findMany.mockResolvedValue([profile(H1, {}, [lane]), profile(H2), profile(H3, { blocked: true })]);
    const [d1] = (await rateService.rate(C, request())).results;
    expect(d1.buy.map((b) => [b.ownerName, b.preferred])).toEqual([["Alfa", true], ["Bravo", false]]);
    expect(d1).toMatchObject({ marginCzk: 1200, marginPercent: 40 });
    // the lane is origin → destination only
    const [back] = (await rateService.rate(C, request({ fromPostcode: "60200", toPostcode: "11000" }))).results;
    expect(back.buy[0].ownerName).toBe("Bravo");
  });

  it("treats a haulier without a profile as blocked", async () => {
    hauliers.findMany.mockResolvedValue([profile(H1)]);
    const [d1] = (await rateService.rate(C, request())).results;
    expect(d1.buy.map((b) => b.ownerName)).toEqual(["Alfa"]);
    expect(d1.excluded.map((e) => e.name)).toEqual(["Bravo", "Cyril"]);
    expect(d1.excluded[0].issues.map((i) => i.code)).toEqual(["missing_insurance", "missing_licence"]);
  });

  it("prices a customer's discount tariff off the Standard list", async () => {
    const [d1] = (await rateService.rate(C, request({ customerId: CUST }))).results;
    expect(isPriced(d1.sell) && d1.sell).toMatchObject({ tariffId: "cust", tariffName: "Acme LTL", ownerName: "Acme s.r.o.", tariffVersionId: "v-std", total: 2700 });
    expect(isPriced(d1.sell) && d1.sell.lines.at(-1)).toMatchObject({ code: "DISCOUNT", label: "Customer discount −10 %", amount: -300 });
    expect(d1).toMatchObject({ marginCzk: 1200, marginPercent: 44.44, belowFloor: false });
  });

  describe("Standard list as the fallback", () => {
    const withMatrix = () => tariffs.list.mockResolvedValue([
      tariff("std", { side: "SELL", name: "Standard LTL" }),
      tariff("cust", { side: "SELL", mode: "DISCOUNT", ownerCustomerId: CUST, name: "Acme LTL", discountPercent: 10 }),
      tariff("m", { side: "SELL", ownerCustomerId: CUST2, name: "Beta LTL" }),
    ]);

    it("uses the customer's own MATRIX tariff when it has a valid version", async () => {
      withMatrix();
      tariffs.bindingOn.mockResolvedValue([version("std", 10), version("m", 8)]);
      const [d1] = (await rateService.rate(C, request({ customerId: CUST2, includeBuy: false }))).results;
      expect(d1.sell).toMatchObject({ tariffId: "m", tariffName: "Beta LTL", total: 2400 });
    });

    it("prices on the Standard list, named so, when the customer's MATRIX has no valid version", async () => {
      withMatrix();
      tariffs.bindingOn.mockResolvedValue([version("std", 10)]);
      const [d1] = (await rateService.rate(C, request({ customerId: CUST2, includeBuy: false }))).results;
      expect(d1.sell).toMatchObject({ tariffId: "std", tariffName: "Standard (customer list not valid on 15 Oct 2026)", total: 3000 });
    });

    it("prices a customer without a tariff of its own on the Standard list", async () => {
      const [d1] = (await rateService.rate(C, request({ customerId: NOBODY, includeBuy: false }))).results;
      expect(d1.sell).toMatchObject({ tariffId: "std", tariffName: "Standard LTL", total: 3000 });
    });

    it("keeps a DISCOUNT as the Standard price minus the discount", async () => {
      const [d1] = (await rateService.rate(C, request({ customerId: CUST, includeBuy: false }))).results;
      expect(d1.sell).toMatchObject({ tariffName: "Acme LTL", total: 2700 });
    });

    it("is unpriced, naming both, when neither the customer's list nor the Standard list is valid", async () => {
      withMatrix();
      tariffs.bindingOn.mockResolvedValue([]);
      const [m] = (await rateService.rate(C, request({ customerId: CUST2, includeBuy: false }))).results;
      expect(m.sell).toEqual({ reason: "Neither Beta LTL nor the Standard LTL sell list has a version valid on 15 Oct 2026" });
      const [d] = (await rateService.rate(C, request({ customerId: CUST, includeBuy: false }))).results;
      expect(d.sell).toEqual({ reason: "Neither Acme LTL nor the Standard LTL sell list has a version valid on 15 Oct 2026" });
    });
  });

  it("flags a margin below the floor", async () => {
    tariffs.bindingOn.mockResolvedValue([version("std", 5.2), version("h1", 5)]);
    const [d1] = (await rateService.rate(C, request())).results;
    expect(d1).toMatchObject({ marginCzk: 60, marginPercent: 3.85, belowFloor: true });
  });

  it("leaves buy and internal out when not asked for, and margins with them", async () => {
    const [d1] = (await rateService.rate(C, request({ includeBuy: false, includeInternal: false }))).results;
    expect(d1).toMatchObject({ buy: [], excluded: [], internal: null, marginCzk: null, marginPercent: null, belowFloor: false });
    expect(fx.fxResolve).not.toHaveBeenCalled();
  });

  it("rates every active level when none is asked for, unpriced where the tariff has none", async () => {
    const res = await rateService.rate(C, request({ serviceLevels: null }));
    expect(res.results.map((r) => r.serviceLevel)).toEqual(["D1", "D2", "D3", "D4", "EXP_SAMEDAY", "EXP_1000", "EXP_1200", "EXP_FIXED"]);
    expect(res.results[1].sell).toEqual({ reason: "Standard LTL has no D2 prices" });
    expect(res.results[1].buy).toEqual([]);
    expect(res.results[7]).toMatchObject({ promisedDate: null, promiseNote: "Date agreed per order" });
  });

  it("is unpriced without a Standard list, and tells when the tariff has no valid version", async () => {
    tariffs.bindingOn.mockResolvedValue([version("h1", 6)]);
    const [d1] = (await rateService.rate(C, request())).results;
    expect(d1.sell).toEqual({ reason: "Standard LTL has no version valid on 15 Oct 2026" });
    tariffs.list.mockResolvedValue([]);
    const [none] = (await rateService.rate(C, request())).results;
    expect(none.sell).toEqual({ reason: "No Standard LTL sell list" });
  });

  it("counts the company's extra holidays in the promised date", async () => {
    vi.mocked(holidays._internalHolidaysCzNational).mockResolvedValue({ dates: ["2026-10-16"] });
    const [d1] = (await rateService.rate(C, request())).results;
    expect(d1.promisedDate).toBe("2026-10-19");
    expect(holidays._internalHolidaysCzNational).toHaveBeenCalledWith(
      { from: "2026-10-15", to: "2026-11-29" },
      { authData: expect.objectContaining({ companyID: C }) },
    );
  });

  it("records what it could not price as coverage gaps, dates taken out", async () => {
    tariffs.bindingOn.mockResolvedValue([version("h1", 6)]);
    await rateService.rate(C, request());
    expect(gaps.record).toHaveBeenCalledWith(C, [
      { side: "SELL", scope: "LTL", serviceLevel: "D1", postcode: "60200", reason: "Standard LTL has no version valid" },
      { side: "INTERNAL", scope: "LTL", serviceLevel: "D1", postcode: "60200", reason: "No internal LTL tariff" },
    ]);
  });

  it("records only the sides a caller names (a buy-only pricing never records the sell)", async () => {
    tariffs.bindingOn.mockResolvedValue([version("h1", 6)]);
    await rateService.rate(C, request(), ["BUY"]);
    expect(gaps.record).toHaveBeenCalledWith(C, []);
  });

  it("still prices when the gaps cannot be recorded", async () => {
    gaps.record.mockRejectedValue(new Error("relation does not exist"));
    const [d1] = (await rateService.rate(C, request())).results;
    expect(isPriced(d1.sell)).toBe(true);
  });

  it("returns the cleaned request", async () => {
    const res = await rateService.rate(C, request());
    expect(res.request).toMatchObject({ fromPostcode: "11000", toPostcode: "60200" });
    expect(res.ratedAt).toBe("2026-10-15T10:00:00.000Z");
  });
});
