import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The review service runs for real (diff, rate engine) against stand-ins for the repositories, the
// settings, the fuel index and the customers / fx services.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  quotes: { _internalQuotesByTariffVersions: vi.fn() },
  customers: { _internalHaulierList: vi.fn(), _internalCustomerPipelineList: vi.fn() },
  fx: { fxResolve: vi.fn() },
  holidays: { _internalHolidaysCzNational: vi.fn() },
}));
const repo = vi.hoisted(() => ({ find: vi.fn(), findVersion: vi.fn(), bindingOn: vi.fn(), versionSummaries: vi.fn() }));
vi.mock("../repositories/portal.repository", () => ({ portalRepository: { revokeSessionsOfHaulier: vi.fn(async () => undefined) } }));
vi.mock("../repositories/tariff.repository", () => ({ tariffRepository: repo }));
const reports = vi.hoisted(() => ({ openConsignmentsPricedWith: vi.fn() }));
vi.mock("../repositories/reports.repository", () => ({ reportsRepository: reports }));
vi.mock("../repositories/rateGap.repository", () => ({ rateGapRepository: { record: vi.fn() } }));
vi.mock("../repositories/haulier.repository", () => ({ haulierRepository: { findMany: vi.fn() } }));
const settings = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../services/settings.service", () => ({ settingsService: settings }));
const fuel = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../services/fuelIndex.service", () => ({ fuelIndexService: fuel }));
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "") }));

import { customers, fx, quotes } from "~encore/clients";
import { tariffReviewService } from "../services/tariffReview.service";
import { DEFAULT_SETTINGS } from "../lib/settingsRules";
import type { PricedSide, TestLaneRequest, Unpriced } from "../interfaces/interfaces";
import { standardSellExample } from "./fixtures/standardSellExample";

const C = "00000000-0000-0000-0000-000000000001";
const T = "00000000-0000-0000-0000-0000000000a1";
const V = "00000000-0000-0000-0000-0000000000b1";
const OLD = "00000000-0000-0000-0000-0000000000b0";

const tariff = (over: object = {}) => ({
  id: T,
  companyId: C,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  side: "SELL",
  scope: "LTL",
  mode: "MATRIX",
  name: "Standard LTL",
  ownerCustomerId: null,
  currency: "CZK",
  zoneBy: "DESTINATION",
  discountPercent: null,
  ...over,
});

const version = (over: object = {}) => ({
  id: V,
  companyId: C,
  createdAt: new Date("2026-10-01T08:00:00Z"),
  updatedAt: new Date(),
  deletedAt: null,
  tariffId: T,
  versionNo: 3,
  validFrom: "2027-01-01",
  validTo: null,
  input: standardSellExample(),
  findings: [],
  serviceLevels: [],
  zoneCount: 9,
  warningCount: 0,
  errorCount: 0,
  createdByUserId: null,
  createdBy: null,
  activatedAt: null,
  activatedBy: null,
  supersededAt: null,
  parseFindings: [],
  sourceFileName: null,
  sourceSha256: null,
  sourceKey: null,
  ...over,
});

const lane = (over: Partial<TestLaneRequest> = {}): TestLaneRequest => ({
  fromPostcode: "110 00",
  toPostcode: "602 00",
  pickupDate: "2026-11-02",
  pieces: 1,
  palletPlaces: 0,
  ldm: 0,
  weightKg: 80,
  cbm: 0,
  extras: { adr: true, tailLift: false, avizace: false, timeWindow: false, b2c: false, nonStackable: false, waitingHours: 0, declaredValueCzk: null },
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
  repo.find.mockResolvedValue(tariff());
  repo.findVersion.mockImplementation(async (_c, id) => (id === V ? version() : null));
  repo.bindingOn.mockResolvedValue([]);
  settings.get.mockResolvedValue(DEFAULT_SETTINGS);
  fuel.list.mockResolvedValue([{ month: "2026-11", percent: 10 }]);
  vi.mocked(customers._internalCustomerPipelineList).mockResolvedValue({ data: [] } as never);
  repo.versionSummaries.mockResolvedValue([{ id: V }, { id: OLD }]);
  reports.openConsignmentsPricedWith.mockResolvedValue(0);
  vi.mocked(quotes._internalQuotesByTariffVersions).mockResolvedValue({ count: 0 });
});

afterEach(() => vi.useRealTimers());

describe("diff", () => {
  it("compares with the version active today by default", async () => {
    const old = standardSellExample();
    old.rates[0].amount = 400;
    repo.bindingOn.mockResolvedValue([version({ id: OLD, versionNo: 2, input: old, activatedAt: new Date("2026-01-01"), validFrom: "2026-01-01" })]);
    const diff = await tariffReviewService.diff(C, V);
    expect(diff.against).toMatchObject({ id: OLD, versionNo: 2, status: "ACTIVE" });
    expect(diff.changedCells).toBe(1);
    expect(diff.cells[0]).toMatchObject({ serviceLevel: "D1", zoneCode: "PRG", before: 400, after: 404, changePercent: 1 });
  });

  it("is empty when the tariff has no active version", async () => {
    expect(await tariffReviewService.diff(C, V)).toMatchObject({ against: null, changedCells: 0, cells: [] });
  });

  it("compares with a chosen version of the same tariff only", async () => {
    repo.findVersion.mockImplementation(async (_c, id) => (id === V ? version() : version({ id: OLD, tariffId: "00000000-0000-0000-0000-0000000000a2" })));
    await expect(tariffReviewService.diff(C, V, OLD)).rejects.toMatchObject({ code: "invalid_argument" });
  });
});

describe("diff: what a change touches", () => {
  it("counts the open quotes and consignments priced with any version of the tariff", async () => {
    vi.mocked(quotes._internalQuotesByTariffVersions).mockResolvedValue({ count: 3 });
    reports.openConsignmentsPricedWith.mockResolvedValue(7);
    const diff = await tariffReviewService.diff(C, V);
    expect(diff).toMatchObject({ affectedOpenQuotes: 3, affectedOpenConsignments: 7 });
    expect(repo.versionSummaries).toHaveBeenCalledWith(C, [T]);
    expect(quotes._internalQuotesByTariffVersions).toHaveBeenCalledWith({ versionIds: [V, OLD] });
    expect(reports.openConsignmentsPricedWith).toHaveBeenCalledWith(C, [V, OLD]);
  });

  it("leaves a count it cannot read null, and still gives the diff", async () => {
    vi.mocked(quotes._internalQuotesByTariffVersions).mockRejectedValue(new Error("quotes down"));
    reports.openConsignmentsPricedWith.mockResolvedValue(2);
    expect(await tariffReviewService.diff(C, V)).toMatchObject({ against: null, affectedOpenQuotes: null, affectedOpenConsignments: 2 });
  });
});

describe("test lane", () => {
  it("prices every level the version offers, sell-style, with the fuel index and surcharges", async () => {
    const levels = await tariffReviewService.testLane(C, V, lane());
    expect(levels.map((l) => [l.serviceLevel, l.label])).toEqual([
      ["D1", "+1 day"],
      ["D2", "+2 days"],
      ["D3", "+3 days"],
      ["D4", "+4 days"],
      ["EXP_1000", "Express by 10:00"],
    ]);
    const d2 = levels[1].result as PricedSide;
    expect(d2).toMatchObject({ tariffVersionId: V, versionNo: 3, zoneCode: "JHM", bandLabel: "51–100 kg" });
    expect(d2.lines.map((l) => [l.code, l.amount])).toEqual([
      ["FREIGHT", 578],
      ["ADR", 350],
      ["FUEL", 58],
    ]);
    expect(fx.fxResolve).not.toHaveBeenCalled();
  });

  it("says why a lane is not priced", async () => {
    const levels = await tariffReviewService.testLane(C, V, lane({ weightKg: 3000 }));
    expect((levels[4].result as Unpriced).reason).toBe("Above the top band — price on request");
    expect(levels[0].result).toMatchObject({ bandLabel: "over 2 500 kg" });
  });

  it("converts a EUR tariff at the ČNB rate of the pickup date", async () => {
    repo.find.mockResolvedValue(tariff({ currency: "EUR" }));
    vi.mocked(fx.fxResolve).mockResolvedValue({ rate: 25, fixingDate: "2026-11-02", date: "2026-11-02" } as never);
    const levels = await tariffReviewService.testLane(C, V, lane());
    expect(fx.fxResolve).toHaveBeenCalledWith({ currency: "EUR", date: "2026-11-02" });
    expect((levels[1].result as PricedSide).totalCzk).toBe((levels[1].result as PricedSide).total * 25);
  });

  it("refuses a bad lane in plain words", async () => {
    await expect(tariffReviewService.testLane(C, V, lane({ toPostcode: "60" }))).rejects.toMatchObject({ code: "invalid_argument" });
  });
});
