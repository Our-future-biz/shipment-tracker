import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The file service runs for real (with the real tariff service, workbook writer and reader) against
// stand-ins for the repository, the bucket, the settings, the fuel index and the customers service.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({ customers: { _internalHaulierList: vi.fn(), _internalCustomerPipelineList: vi.fn() } }));
const repo = vi.hoisted(() => ({ find: vi.fn(), findVersion: vi.fn(), bindingOn: vi.fn(), createVersion: vi.fn() }));
vi.mock("../repositories/tariff.repository", () => ({ tariffRepository: repo }));
const bucket = vi.hoisted(() => ({ upload: vi.fn(), download: vi.fn(), remove: vi.fn() }));
vi.mock("../storage/tariffFileBucket", () => ({ tariffFileBucket: bucket }));
const settings = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../services/settings.service", () => ({ settingsService: settings }));
const fuel = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../services/fuelIndex.service", () => ({ fuelIndexService: fuel }));
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "Jana Nováková") }));

import { customers } from "~encore/clients";
import { DISCOUNT_NO_FILE, tariffFileService } from "../services/tariffFile.service";
import { DEFAULT_SETTINGS } from "../lib/settingsRules";
import { loadWorkbookTables, writeTariffWorkbook, XLSX_CONTENT_TYPE } from "../lib/tariffWorkbook";
import type { TariffVersionInput } from "../interfaces/interfaces";
import { EXAMPLE_TARIFF, standardSellExample } from "./fixtures/standardSellExample";

const C = "00000000-0000-0000-0000-000000000001";
const U = "00000000-0000-0000-0000-000000000002";
const T = "00000000-0000-0000-0000-0000000000a1";
const V = "00000000-0000-0000-0000-0000000000b1";
const CUST = "00000000-0000-0000-0000-0000000000c1";

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
  versionNo: 2,
  validFrom: "2027-01-01",
  validTo: null,
  input: standardSellExample(),
  findings: [],
  serviceLevels: ["D1", "D2", "D3", "D4", "EXP_1000"],
  zoneCount: 9,
  warningCount: 0,
  errorCount: 0,
  createdByUserId: U,
  createdBy: "Jana Nováková",
  activatedAt: new Date("2026-10-02T08:00:00Z"),
  activatedBy: "Jana Nováková",
  supersededAt: null,
  parseFindings: [],
  sourceFileName: null,
  sourceSha256: null,
  sourceKey: null,
  ...over,
});

const fileOf = async (input: TariffVersionInput) =>
  (await writeTariffWorkbook({ tariff: EXAMPLE_TARIFF, input, levelLabels: {} })).toString("base64");

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
  repo.find.mockResolvedValue(tariff());
  repo.bindingOn.mockResolvedValue([]);
  repo.createVersion.mockImplementation(async (_c, _t, values) => version({ ...values, activatedAt: null, activatedBy: null }));
  settings.get.mockResolvedValue(DEFAULT_SETTINGS);
  fuel.list.mockResolvedValue([{ month: "2026-10", percent: 9 }]);
  bucket.upload.mockResolvedValue({});
  bucket.remove.mockResolvedValue(undefined);
  vi.mocked(customers._internalCustomerPipelineList).mockResolvedValue({ data: [{ id: CUST, companyName: "Alfa a.s." }] } as never);
});

afterEach(() => vi.useRealTimers());

describe("template", () => {
  it("exports the active version, named after the tariff and version", async () => {
    repo.bindingOn.mockResolvedValue([version()]);
    const file = await tariffFileService.template(C, T);
    expect(file).toMatchObject({ fileName: "standard-ltl-v2.xlsx", contentType: XLSX_CONTENT_TYPE });
    const tables = await loadWorkbookTables(Buffer.from(file.fileBase64, "base64"));
    expect(tables.map((t) => t.name)).toEqual(["Read me", "Meta", "Zones", "D1", "D2", "D3", "D4", "EXP_1000", "Surcharges"]);
    expect(tables[3].rows[0][0]).toBe("D1: +1 day");
  });

  it("exports the chosen version, which must belong to the tariff", async () => {
    repo.findVersion.mockResolvedValue(version({ versionNo: 5 }));
    expect((await tariffFileService.template(C, T, V)).fileName).toBe("standard-ltl-v5.xlsx");
    repo.findVersion.mockResolvedValue(version({ tariffId: "00000000-0000-0000-0000-0000000000a2" }));
    await expect(tariffFileService.template(C, T, V)).rejects.toMatchObject({ code: "not_found" });
  });

  it("gives the empty template when the tariff has no active version", async () => {
    const file = await tariffFileService.template(C, T);
    expect(file.fileName).toBe("standard-ltl-template.xlsx");
    const tables = await loadWorkbookTables(Buffer.from(file.fileBase64, "base64"));
    expect(tables.map((t) => t.name)).toEqual(["Read me", "Meta", "Zones", "D1", "Surcharges"]);
    expect(tables[1].rows.find((r) => r[0] === "kg per LDM")?.[1]).toBe(DEFAULT_SETTINGS.factors.kgPerLdm);
  });

  it("refuses a discount tariff", async () => {
    repo.find.mockResolvedValue(tariff({ mode: "DISCOUNT", ownerCustomerId: CUST, discountPercent: 5 }));
    await expect(tariffFileService.template(C, T)).rejects.toMatchObject({ code: "invalid_argument", message: DISCOUNT_NO_FILE });
  });
});

describe("import", () => {
  it("saves a draft from the file, keeps the file and logs the import", async () => {
    const fileBase64 = await fileOf(standardSellExample());
    const result = await tariffFileService.import(C, U, "manager", T, " standard 2027.xlsx ", fileBase64);

    const [key, bytes, options] = bucket.upload.mock.calls[0];
    expect(key).toMatch(new RegExp(`^${C}/${T}/[0-9a-f-]{36}\\.xlsx$`));
    expect(options).toEqual({ contentType: XLSX_CONTENT_TYPE });
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    const [, tariffId, values, event] = repo.createVersion.mock.calls[0];
    expect(tariffId).toBe(T);
    expect(values).toMatchObject({ id: key.split("/")[2].replace(".xlsx", ""), sourceKey: key, sourceFileName: "standard 2027.xlsx", sourceSha256: sha256, parseFindings: [] });
    expect(values.input).toEqual(standardSellExample());
    expect(event).toMatchObject({
      kind: "tariff_version_imported",
      payload: { file: { name: "standard 2027.xlsx", sha256, errorCount: 0, warningCount: 0 } },
    });
    expect(result.version).toMatchObject({ status: "DRAFT", sourceFileName: "standard 2027.xlsx", errorCount: 0 });
    expect(result.sheets.map((s) => s.read)).toEqual(["ignored", "used", "used", "used", "used", "used", "used", "used", "used"]);
  });

  it("saves a draft with errors: the problems of the file come first, then the version's findings", async () => {
    const input = standardSellExample();
    input.rates[0].amount = -5;
    input.zones.push({ code: "X", label: "Twin", postcodeFrom: "10000", postcodeTo: "19999", remote: false });
    const file = Buffer.from(await fileOf(input), "base64");
    // a word in a price cell, typed after the export
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file as never);
    wb.getWorksheet("D2")!.getCell("F5").value = "ask";
    const edited = Buffer.from(await wb.xlsx.writeBuffer()).toString("base64");

    const result = await tariffFileService.import(C, U, "manager", T, "t.xlsx", edited);
    const [, , values] = repo.createVersion.mock.calls[0];
    expect(values.parseFindings).toEqual([{ severity: "error", message: '"ask" is not a number', where: "Sheet D2, row 5, column F" }]);
    expect(values.findings[0]).toEqual(values.parseFindings[0]);
    expect(values.findings.map((f: { message: string }) => f.message)).toContain("The price is negative");
    expect(values.findings.map((f: { message: string }) => f.message)).toContain("Zones PRG and X have the same postcode range 100 00–199 99");
    expect(values.errorCount).toBe(3);
    expect(result.version.errorCount).toBe(3);
  });

  it("refuses non-managers, discount tariffs, empty, too large and unreadable files", async () => {
    const ok = await fileOf(standardSellExample());
    await expect(tariffFileService.import(C, U, "user", T, "t.xlsx", ok)).rejects.toMatchObject({ code: "permission_denied" });
    repo.find.mockResolvedValueOnce(tariff({ mode: "DISCOUNT", ownerCustomerId: CUST, discountPercent: 5 }));
    await expect(tariffFileService.import(C, U, "manager", T, "t.xlsx", ok)).rejects.toMatchObject({ code: "invalid_argument", message: DISCOUNT_NO_FILE });
    await expect(tariffFileService.import(C, U, "manager", T, "t.xlsx", "")).rejects.toMatchObject({ message: "The file is empty" });
    await expect(tariffFileService.import(C, U, "manager", T, "", ok)).rejects.toMatchObject({ message: "The file name is missing" });
    await expect(tariffFileService.import(C, U, "manager", T, "t.xlsx", "A".repeat(7_200_000))).rejects.toMatchObject({
      code: "invalid_argument",
      message: "The file is larger than 5 MB",
    });
    const csv = Buffer.from("Zone code;Label\n1;Praha").toString("base64");
    await expect(tariffFileService.import(C, U, "manager", T, "t.csv", csv)).rejects.toMatchObject({
      code: "invalid_argument",
      message: expect.stringContaining("This is not an Excel .xlsx file"),
    });
    expect(bucket.upload).not.toHaveBeenCalled();
    expect(repo.createVersion).not.toHaveBeenCalled();
  });

  it("removes the stored file when the draft cannot be saved", async () => {
    repo.createVersion.mockRejectedValue(new Error("db down"));
    await expect(tariffFileService.import(C, U, "manager", T, "t.xlsx", await fileOf(standardSellExample()))).rejects.toThrow("db down");
    expect(bucket.remove).toHaveBeenCalledWith(bucket.upload.mock.calls[0][0]);
  });
});

describe("source", () => {
  it("returns the stored file, or not_found for a version entered without one", async () => {
    repo.findVersion.mockResolvedValue(version({ sourceKey: `${C}/${T}/${V}.xlsx`, sourceFileName: "standard 2027.xlsx" }));
    bucket.download.mockResolvedValue(Buffer.from("xlsx bytes"));
    expect(await tariffFileService.source(C, V)).toEqual({
      fileName: "standard 2027.xlsx",
      fileBase64: Buffer.from("xlsx bytes").toString("base64"),
      contentType: XLSX_CONTENT_TYPE,
    });
    expect(bucket.download).toHaveBeenCalledWith(`${C}/${T}/${V}.xlsx`);
    repo.findVersion.mockResolvedValue(version());
    await expect(tariffFileService.source(C, V)).rejects.toMatchObject({ code: "not_found" });
  });
});
