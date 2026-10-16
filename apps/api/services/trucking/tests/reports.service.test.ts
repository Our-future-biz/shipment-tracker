import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

// The reports service runs for real (lib/reportCalc.ts, the workbook) against stand-ins for the
// grouped queries, the coverage gaps, the tariffs, the haulier profiles, the settings and the
// customers / fx / holidays services.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
const log = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("encore.dev/log", () => ({ default: log }));
vi.mock("~encore/clients", () => ({
  customers: { _internalHaulierList: vi.fn() },
  holidays: { _internalHolidaysCzNational: vi.fn() },
}));
const repo = vi.hoisted(() => ({
  deliveredGroups: vi.fn(),
  marginGroups: vi.fn(),
  podPairs: vi.fn(),
  haulierPerf: vi.fn(),
  haulierCosts: vi.fn(),
  failedReasons: vi.fn(),
  podOpen: vi.fn(),
  fillTrips: vi.fn(),
  exceptionGroups: vi.fn(),
  claims: vi.fn(),
  invoicesBlocked: vi.fn(),
  invoiceDifferences: vi.fn(),
  internalGroups: vi.fn(),
  chargedExceptions: vi.fn(),
}));
vi.mock("../repositories/portal.repository", () => ({ portalRepository: { revokeSessionsOfHaulier: vi.fn(async () => undefined) } }));
vi.mock("../repositories/reports.repository", () => ({ reportsRepository: repo }));
const gaps = vi.hoisted(() => ({ lastIn: vi.fn() }));
vi.mock("../repositories/rateGap.repository", () => ({ rateGapRepository: gaps }));
const tariffs = vi.hoisted(() => ({ list: vi.fn(), bindingOn: vi.fn() }));
vi.mock("../repositories/tariff.repository", () => ({ tariffRepository: tariffs }));
const hauliers = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("../repositories/haulier.repository", () => ({ haulierRepository: hauliers }));
const settings = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../services/settings.service", () => ({ settingsService: settings }));
const rates = vi.hoisted(() => ({ eurRate: vi.fn() }));
vi.mock("../services/rate.service", () => rates);
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "") }));

import { customers, holidays } from "~encore/clients";
import { reportsService } from "../services/reports.service";
import { DEFAULT_SETTINGS } from "../lib/settingsRules";
import { REPORT_SHEETS } from "../lib/reportWorkbook";
import type { DeliveredGroup } from "../lib/reportCalc";

const C = "00000000-0000-0000-0000-000000000001";
const H1 = "00000000-0000-0000-0000-0000000000a1";
const H2 = "00000000-0000-0000-0000-0000000000a2";
const NOW = new Date("2026-10-30T10:00:00Z");

const group = (over: Partial<DeliveredGroup> = {}): DeliveredGroup => ({
  scope: "LTL",
  serviceLevel: "D1",
  internal: false,
  delivered: 4,
  customerFailed: 0,
  noPromise: 0,
  onTime: 3,
  failed: 1,
  avizaceNeeded: 2,
  avizaceBefore: 2,
  costed: 4,
  costReal: 1,
  costCzk: 8000,
  costKg: 4000,
  pallets: 8,
  palletCostCzk: 8000,
  margined: 4,
  marginSellCzk: 10000,
  marginBuyCzk: 8000,
  belowFloor: 1,
  sellCzk: 10000,
  ...over,
});

const profile = (customerId: string) => ({
  profile: {
    id: `p-${customerId}`,
    companyId: C,
    customerId,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    insurer: "Kooperativa",
    insurancePolicyNo: "P-1",
    insuranceLimit: 300000,
    insuranceCurrency: "EUR",
    insuranceValidTo: "2027-06-30",
    licenceNo: "KON-1",
    licenceValidTo: null,
    licenceUnlimited: true,
    adrCapable: false,
    vehicleTypes: ["van"],
    paymentDays: 30,
    currency: "CZK",
    vatUnreliable: false,
    bankAccountPublished: true,
    vatCheckedAt: "2026-10-10",
    bankAccounts: [],
    costSplitBasis: "chargeable_weight",
    blocked: false,
    blockReason: "",
    blockedAt: null,
    blockedBy: null,
    notes: "",
    version: 1,
  },
  lanes: [],
});

const zones = [
  { code: "1", label: "Praha", postcodeFrom: "10000", postcodeTo: "19999", remote: false },
  { code: "4", label: "Brno", postcodeFrom: "60000", postcodeTo: "69999", remote: false },
];

beforeEach(() => {
  vi.resetAllMocks();
  settings.get.mockResolvedValue({ ...DEFAULT_SETTINGS, version: 1, updatedAt: null, updatedBy: null });
  repo.deliveredGroups.mockResolvedValue([group(), group({ internal: true, delivered: 2, onTime: 2, failed: 0, avizaceNeeded: 0, avizaceBefore: 0, costed: 2, costReal: 2, costCzk: 2000, costKg: 1000, pallets: 0, palletCostCzk: 0, margined: 0, marginSellCzk: 0, marginBuyCzk: 0, belowFloor: 0, sellCzk: 0 })]);
  repo.marginGroups.mockResolvedValue([
    { dim: "customer", key: "c1", label: "TEST Odběratel Ostrava", consignments: 4, sellCzk: 10000, buyCzk: 8000, belowFloor: 1 },
    { dim: "lane", key: "11000>60200", label: "", consignments: 4, sellCzk: 10000, buyCzk: 8000, belowFloor: 1 },
    { dim: "serviceLevel", key: "D1", label: "", consignments: 4, sellCzk: 10000, buyCzk: 8000, belowFloor: 1 },
  ]);
  repo.podPairs.mockResolvedValue([{ deliveredDay: "2026-10-23", podDay: "2026-10-27", haulierId: H1, n: 2 }]);
  repo.haulierPerf.mockResolvedValue([{ haulierId: H1, haulierName: "Alfa (trip)", delivered: 4, measured: 4, onTime: 3, failed: 1 }]);
  repo.haulierCosts.mockResolvedValue([{ haulierId: H1, haulierName: "Alfa (trip)", trips: 2, partnerLegs: 1, consignments: 4, costCzk: 8000, costKg: 4000 }]);
  repo.failedReasons.mockResolvedValue([{ reason: "ABSENT", n: 1 }]);
  repo.podOpen.mockResolvedValue([{ deliveredDay: "2026-09-30", haulierId: H2, haulierName: null, n: 1 }]);
  repo.fillTrips.mockResolvedValue([{ kind: "LINEHAUL", vehicleTypeCode: "tautliner_136", ldm: 6.8, kg: 6000 }]);
  repo.exceptionGroups.mockResolvedValue([{ kind: "FAILED_DELIVERY", decision: "PENDING", n: 1 }]);
  repo.claims.mockResolvedValue([{ haulierId: H1, currency: "EUR", day: "2026-10-20", n: 1, amount: 20 }]);
  repo.invoicesBlocked.mockResolvedValue([]);
  repo.invoiceDifferences.mockResolvedValue([]);
  repo.internalGroups.mockResolvedValue([{ department: "Air", amountCzk: 3000, consignments: 2 }]);
  repo.chargedExceptions.mockResolvedValue([{ haulierId: "", currency: "EUR", day: "2026-10-20", n: 1, amount: 40 }]);
  gaps.lastIn.mockResolvedValue([{ id: "g", companyId: C, side: "SELL", scope: "LTL", serviceLevel: "D2", postcode: "79001", reason: "No zone for postcode 790 01 in Standard LTL", count: 3, firstAt: NOW, lastAt: NOW }]);
  tariffs.list.mockResolvedValue([{ id: "std", scope: "LTL", side: "SELL", ownerCustomerId: null }]);
  tariffs.bindingOn.mockResolvedValue([{ tariffId: "std", input: { zones } }]);
  hauliers.findMany.mockResolvedValue([profile(H1)]);
  vi.mocked(customers._internalHaulierList).mockResolvedValue({ hauliers: [{ id: H1, companyName: "Alfa s.r.o.", ico: "", dic: "", city: "" }] });
  vi.mocked(holidays._internalHolidaysCzNational).mockResolvedValue({ dates: [] });
  rates.eurRate.mockResolvedValue({ rate: 25, date: "2026-10-20" });
});

describe("Trucking report", () => {
  it("works the report out of the grouped rows of the company and period", async () => {
    const r = await reportsService.report(C, { from: "2026-10-01", to: "2026-10-30" }, NOW);
    const scope = { companyId: C, period: { from: "2026-10-01", to: "2026-10-30" }, factors: DEFAULT_SETTINGS.factors, floor: DEFAULT_SETTINGS.marginFloor };
    expect(repo.deliveredGroups).toHaveBeenCalledWith(scope);
    expect(repo.fillTrips).toHaveBeenCalledWith(C, scope.period);
    expect(gaps.lastIn).toHaveBeenCalledWith(C, "2026-10-01", "2026-10-30", 50);
    // Holidays from the oldest day a figure needs (an open POD of September) to today.
    expect(holidays._internalHolidaysCzNational).toHaveBeenCalledWith({ from: "2026-09-30", to: "2026-10-30" }, { authData: expect.objectContaining({ companyID: C }) });

    expect(r.from).toBe("2026-10-01");
    const k = (key: string) => r.kpis.find((x) => x.key === key)!;
    expect(k("onTime")).toMatchObject({ value: 83.3, n: 6 });
    expect(k("firstAttempt")).toMatchObject({ value: 83.3, n: 6 });
    expect(k("daysToPod")).toMatchObject({ value: 2, n: 2 });
    expect(k("podMissing")).toMatchObject({ value: 1 });
    expect(k("lineHaulFill")).toMatchObject({ value: 50, n: 1 });
    expect(k("costPerKg")).toMatchObject({ value: 2, n: 6 });
    expect(k("margin")).toMatchObject({ value: 20, n: 4 });
    expect(k("exceptionRate")).toMatchObject({ value: 16.7 });
    expect(k("avizaceDone")).toMatchObject({ value: 100 });

    expect(r.marginByLane[0]).toMatchObject({ label: "110 00 → 602 00 (zones 1 → 4)", marginCzk: 2000, marginPercent: 20, belowFloor: 1 });
    expect(r.marginByServiceLevel[0]!.label).toBe("+1 day");
    expect(r.marginByCustomer[0]!.label).toBe("TEST Odběratel Ostrava");

    expect(r.hauliers).toEqual([
      expect.objectContaining({ haulierCustomerId: H1, name: "Alfa s.r.o.", status: "ok", trips: 2, partnerLegs: 1, onTimePercent: 75, avgDaysToPod: 2, claims: 1, claimedCzk: 500, costPerKg: 2 }),
    ]);
    expect(rates.eurRate).toHaveBeenCalledWith("2026-10-20");
    expect(r.coverageGaps).toEqual([{ side: "SELL", scope: "LTL", serviceLevel: "D2", postcode: "79001", reason: "No zone for postcode 790 01 in Standard LTL", count: 3, lastAt: NOW.toISOString() }]);
    expect(r.department).toEqual({
      externalSellCzk: 10000,
      exceptionChargesCzk: 1000,
      internalChargesCzk: 3000,
      haulierCostCzk: 10000,
      resultCzk: 4000,
      internalByDepartment: [{ department: "Air", amountCzk: 3000, consignments: 2 }],
    });
  });

  it("refuses a period it cannot use before reading anything", async () => {
    await expect(reportsService.report(C, { from: "2026-10-10", to: "2026-10-01" }, NOW)).rejects.toMatchObject({ code: "invalid_argument", message: "The period starts after it ends" });
    await expect(reportsService.report(C, { from: "2025-01-01", to: "2026-10-01" }, NOW)).rejects.toThrow(/366 days/);
    await expect(reportsService.report(C, { from: "1.10.2026", to: "2026-10-01" }, NOW)).rejects.toThrow(/YYYY-MM-DD/);
    expect(repo.deliveredGroups).not.toHaveBeenCalled();
  });

  it("still reports when the coverage gaps cannot be read (logged), and without a Standard list has no zones", async () => {
    gaps.lastIn.mockRejectedValue(new Error('relation "trucking_rate_gap" does not exist'));
    tariffs.list.mockResolvedValue([]);
    const r = await reportsService.report(C, { from: "2026-10-01", to: "2026-10-30" }, NOW);
    expect(r.coverageGaps).toEqual([]);
    expect(log.warn).toHaveBeenCalled();
    expect(r.marginByLane[0]!.label).toBe("110 00 → 602 00");
  });

  it("names no haulier it does not need", async () => {
    for (const m of [repo.podPairs, repo.haulierPerf, repo.haulierCosts, repo.podOpen, repo.claims]) m.mockResolvedValue([]);
    const r = await reportsService.report(C, { from: "2026-10-01", to: "2026-10-30" }, NOW);
    expect(r.hauliers).toEqual([]);
    expect(customers._internalHaulierList).not.toHaveBeenCalled();
    expect(holidays._internalHolidaysCzNational).toHaveBeenCalledWith({ from: "2026-10-01", to: "2026-10-30" }, expect.anything());
  });
});

describe("Trucking report export", () => {
  it("builds an xlsx with the seven sheets", async () => {
    const file = await reportsService.exportReport(C, { from: "2026-10-01", to: "2026-10-30" });
    expect(file).toMatchObject({ fileName: "trucking-report-2026-10-01-2026-10-30.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(file.fileBase64, "base64") as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual([...REPORT_SHEETS]);
    expect(wb.getWorksheet("KPIs")!.getRow(2).getCell(1).value).toBe("On time");
    expect(wb.getWorksheet("Margin by lane")!.getRow(2).getCell(1).value).toBe("110 00 → 602 00 (zones 1 → 4)");
    expect(wb.getWorksheet("Coverage gaps")!.getRow(2).getCell(4).value).toBe("79001");
    const hauliers = wb.getWorksheet("Hauliers")!;
    expect([hauliers.getRow(1).getCell(3).value, hauliers.getRow(1).getCell(4).value]).toEqual(["Trips", "Partner deliveries"]);
    expect([hauliers.getRow(2).getCell(3).value, hauliers.getRow(2).getCell(4).value]).toEqual([2, 1]);
    const dep = wb.getWorksheet("Department")!;
    expect(dep.getRow(3).values).toEqual([undefined, "+ Exceptions charged to customers", 1000]);
    expect(dep.getRow(6).values).toEqual([undefined, "= Result", 4000]);
    expect(dep.getRow(9).values).toEqual([undefined, "Air", 3000, 2]);
  });
});
