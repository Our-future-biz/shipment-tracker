import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({ customers: { _internalCompaniesWithRole: vi.fn() } }));
vi.mock("../../../lib/userNames", () => ({ userRefs: vi.fn(async () => new Map([["user-1", { name: "Jana Nová", email: "", role: "manager" }]])) }));
vi.mock("../storage/tariffFileBucket", () => ({ tariffFileBucket: { upload: vi.fn(), remove: vi.fn(async () => undefined), download: vi.fn() } }));
vi.mock("../services/railLayoutReader.service", () => ({ readRailLayout: vi.fn() }));
vi.mock("../repositories/tariff.repository", () => ({
  tariffRepository: {
    list: vi.fn(),
    get: vi.fn(),
    versionsOf: vi.fn(),
    getVersion: vi.fn(),
    createDraft: vi.fn(),
    replaceDraft: vi.fn(),
    approve: vi.fn(),
    update: vi.fn(),
    ratesOnRoute: vi.fn(),
  },
}));

import { customers } from "~encore/clients";
import type { RailLayout } from "../interfaces/interfaces";
import type { RouteRate } from "../repositories/tariff.repository";
import { tariffRepository } from "../repositories/tariff.repository";
import type { TariffRecord, TariffVersionRecord } from "../schemas/tariff.schema";
import { readRailLayout } from "../services/railLayoutReader.service";
import { railTariffService } from "../services/railTariff.service";
import { tariffFileBucket } from "../storage/tariffFileBucket";

const COMPANY = "company-1";
const VERSION_ID = "44444444-4444-4444-8444-444444444444";
const TARIFF_ID = "55555555-5555-4555-8555-555555555555";
const ACTOR = { userID: "user-1", companyID: COMPANY, role: "manager" };
const METRANS = { id: "11111111-1111-4111-8111-111111111111", companyName: "METRANS a.s.", ico: "25676598", dic: "", city: "Praha", country: "CZ" };

const repo = vi.mocked(tariffRepository);
const companiesWithRole = vi.mocked(customers._internalCompaniesWithRole);

const LAYOUT: RailLayout = {
  sheet: "26 Rail", // a CSV file's one sheet is named after the file
  headerRow: 1,
  firstDataRow: 2,
  lastDataRow: null,
  columns: { country: null, postcode: "A", place: "B", region: null, via: "C", emptyDepot: "C", note: null, validFrom: null, validTo: null },
  bands: [{ column: "D", label: "20' <14 t", minLengthFt: 20, maxLengthFt: 20, maxGrossTonnes: 14 }],
  currency: "EUR",
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  defaultCountry: "CZ",
  conditions: [],
  links: [],
  name: "Hamburg – Czechia",
};

// A tiny tariff as CSV: the sheet reader handles it without Excel.
const CSV = "PLZ;Destination;Via/Depot;20' <14 t\n36235;Abertamy;Usti/Usti;746\n67904;Adamov;Cetr/Cetr;774\n";
// A new tariff for Hamburg and Bremerhaven, import and export, unless the test says otherwise.
const upload = (extra: Partial<Parameters<typeof railTariffService.upload>[1]> = {}) =>
  railTariffService.upload(ACTOR, {
    supplierCustomerId: METRANS.id,
    ports: ["DEHAM", "DEBRV"],
    directions: ["import", "export"],
    fileName: "26 Rail.csv",
    fileBase64: Buffer.from(CSV).toString("base64"),
    ...extra,
  });

const version = (over: Partial<TariffVersionRecord>): TariffVersionRecord =>
  ({
    id: VERSION_ID,
    tariffId: TARIFF_ID,
    versionNo: 1,
    status: "active",
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
    currency: "EUR",
    layout: LAYOUT,
    layoutSource: "ai",
    findings: [],
    preview: [],
    rowCount: 2,
    warningCount: 0,
    errorCount: 0,
    sourceFileName: "26 Rail.csv",
    createdAt: new Date("2026-10-28T08:00:00Z"),
    createdBy: "Jana Nová",
    activatedAt: null,
    activatedBy: null,
    ...over,
  }) as TariffVersionRecord;

const tariff = (over: Partial<TariffRecord> = {}): TariffRecord =>
  ({
    id: TARIFF_ID,
    companyId: COMPANY,
    supplierCustomerId: METRANS.id,
    mode: "rail",
    name: "Hamburg – Czechia",
    ports: ["DEHAM"],
    directions: ["import"],
    layout: null,
    ...over,
  }) as TariffRecord;

beforeEach(() => {
  vi.clearAllMocks();
  companiesWithRole.mockResolvedValue({ companies: [METRANS] });
  vi.mocked(readRailLayout).mockResolvedValue(LAYOUT);
  repo.createDraft.mockResolvedValue(version({ status: "draft" }));
  repo.getVersion.mockResolvedValue(version({ status: "draft" }));
  repo.get.mockResolvedValue(tariff());
});

describe("operators", () => {
  it("count each operator's tariffs, the versions pricing today, drafts and the soonest end", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-28T10:00:00Z") });
    repo.list.mockResolvedValue([tariff(), tariff({ id: "33333333-3333-4333-8333-333333333333", ports: ["SIKOP", "DEHAM"], directions: ["export"] })]);
    repo.versionsOf.mockResolvedValue([
      version({ id: "a", validTo: "2026-12-31" }),
      version({ id: "b", tariffId: "33333333-3333-4333-8333-333333333333", validTo: "2026-11-30" }),
      version({ id: "c", validFrom: "2027-01-01", validTo: "2027-12-31" }), // approved, starts later
      version({ id: "d", status: "superseded" }),
      version({ id: "e", status: "draft" }),
    ]);
    const [operator] = await railTariffService.operators(COMPANY);
    expect(operator).toMatchObject({ customerId: METRANS.id, tariffCount: 2, activeCount: 2, draftCount: 1, activeUntil: "2026-11-30" });
    // The ports and directions of all its tariffs together, each once, in the list's order.
    expect(operator).toMatchObject({ ports: ["DEHAM", "SIKOP"], directions: ["import", "export"] });
    vi.useRealTimers();
  });
});

describe("upload", () => {
  it("reads a new tariff's file into a draft: the AI's layout, every row, the file kept", async () => {
    await upload();
    expect(readRailLayout).toHaveBeenCalledWith([expect.objectContaining({ name: "26 Rail" })], null);
    expect(tariffFileBucket.upload).toHaveBeenCalledWith(expect.stringMatching(/^company-1\/.+\/26_Rail\.csv$/), expect.any(Buffer), { contentType: "text/csv" });
    const [company, target, fields, rows] = repo.createDraft.mock.calls[0]!;
    expect(company).toBe(COMPANY);
    expect(target).toEqual({ supplierCustomerId: METRANS.id, mode: "rail", name: "Hamburg – Czechia", ports: ["DEHAM", "DEBRV"], directions: ["import", "export"] });
    expect(fields).toMatchObject({ layoutSource: "ai", rowCount: 2, errorCount: 0, validFrom: "2026-01-01", sourceFileName: "26 Rail.csv", createdBy: "Jana Nová" });
    expect(rows.map((r) => [r.place, r.via, r.emptyDepot, r.prices])).toEqual([
      ["Abertamy", "Usti", "Usti", { "20ft-14t": 746 }],
      ["Adamov", "Cetr", "Cetr", { "20ft-14t": 774 }],
    ]);
  });

  it("shows the AI the layout the tariff's last approved version was read with", async () => {
    repo.get.mockResolvedValue(tariff({ layout: LAYOUT }));
    await upload({ tariffId: TARIFF_ID });
    expect(readRailLayout).toHaveBeenCalledWith(expect.any(Array), LAYOUT);
    expect(repo.createDraft).toHaveBeenCalledWith(COMPANY, { tariffId: TARIFF_ID }, expect.objectContaining({ layoutSource: "remembered" }), expect.any(Array));
  });

  it("refuses a new tariff without its ports or directions before asking the AI", async () => {
    await expect(upload({ ports: [] })).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringContaining("port") });
    await expect(upload({ directions: undefined })).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringContaining("import, export or both") });
    expect(readRailLayout).not.toHaveBeenCalled();
  });

  it("keeps a new version's tariff as it is: ports and directions sent with it are ignored", async () => {
    await upload({ tariffId: TARIFF_ID, ports: [], directions: [] });
    expect(repo.createDraft).toHaveBeenCalledWith(COMPANY, { tariffId: TARIFF_ID }, expect.any(Object), expect.any(Array));
  });

  it("is refused for a company that is not a rail operator, or a tariff of another one", async () => {
    companiesWithRole.mockResolvedValueOnce({ companies: [] });
    await expect(upload()).rejects.toMatchObject({ code: "not_found" });
    repo.get.mockResolvedValue(tariff({ supplierCustomerId: "someone-else" }));
    await expect(upload({ tariffId: TARIFF_ID })).rejects.toMatchObject({ code: "not_found" });
    expect(readRailLayout).not.toHaveBeenCalled();
  });

  it("refuses an empty file and an old .xls before asking the AI", async () => {
    await expect(upload({ fileBase64: "" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(upload({ fileName: "26 Rail.xls" })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(readRailLayout).not.toHaveBeenCalled();
  });

  it("removes the stored file again when the draft cannot be saved", async () => {
    repo.createDraft.mockRejectedValue(new Error("db down"));
    await expect(upload()).rejects.toThrow("db down");
    expect(tariffFileBucket.remove).toHaveBeenCalledWith(vi.mocked(tariffFileBucket.upload).mock.calls[0]![0]);
  });

  it("saves a draft with an error, not rows, when the layout names a sheet the file lacks", async () => {
    vi.mocked(readRailLayout).mockResolvedValue({ ...LAYOUT, sheet: "Prices" });
    await upload();
    const [, , fields, rows] = repo.createDraft.mock.calls[0]!;
    expect(rows).toEqual([]);
    expect(fields).toMatchObject({ errorCount: 1, findings: [expect.objectContaining({ level: "error", code: "layout_unusable" })] });
  });
});

describe("relayout and approval", () => {
  it("answer not found for an id that cannot be one, without asking the database", async () => {
    await expect(railTariffService.version(COMPANY, "not-an-id")).rejects.toMatchObject({ code: "not_found" });
    await expect(railTariffService.approve(ACTOR, "not-an-id")).rejects.toMatchObject({ code: "not_found" });
    expect(repo.getVersion).not.toHaveBeenCalled();
    expect(repo.approve).not.toHaveBeenCalled();
  });

  it("changes only a draft's layout", async () => {
    repo.getVersion.mockResolvedValue(version({ status: "active" }));
    await expect(railTariffService.relayout(COMPANY, VERSION_ID, LAYOUT)).rejects.toMatchObject({ code: "failed_precondition" });
    expect(repo.replaceDraft).not.toHaveBeenCalled();
  });

  it("passes the repository's reason on when a draft cannot be approved", async () => {
    repo.approve.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    await expect(railTariffService.approve(ACTOR, VERSION_ID)).rejects.toMatchObject({ code: "not_found" });
    repo.approve.mockResolvedValueOnce({ ok: false, reason: "The draft still has errors; correct the layout or the file first" });
    await expect(railTariffService.approve(ACTOR, VERSION_ID)).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringContaining("errors") });
  });
});

describe("update", () => {
  it("saves the name, ports and directions, each once and in the list's order", async () => {
    repo.update.mockImplementation(async (_, id, fields) => tariff({ id, ...fields }));
    const saved = await railTariffService.update(COMPANY, TARIFF_ID, { name: " Koper – Czechia ", ports: ["SIKOP", "DEHAM", "SIKOP"], directions: ["export", "import"] });
    expect(repo.update).toHaveBeenCalledWith(COMPANY, TARIFF_ID, { name: "Koper – Czechia", ports: ["DEHAM", "SIKOP"], directions: ["import", "export"] });
    expect(saved).toEqual({ id: TARIFF_ID, name: "Koper – Czechia", ports: ["DEHAM", "SIKOP"], directions: ["import", "export"] });
  });

  it("refuses a tariff left without a port, a direction or a name", async () => {
    await expect(railTariffService.update(COMPANY, TARIFF_ID, { name: "x", ports: [], directions: ["import"] })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(railTariffService.update(COMPANY, TARIFF_ID, { name: "x", ports: ["DEHAM"], directions: [] })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(railTariffService.update(COMPANY, TARIFF_ID, { name: " ", ports: ["DEHAM"], directions: ["import"] })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("answers not found for a tariff that is not there", async () => {
    repo.update.mockResolvedValue(null);
    await expect(railTariffService.update(COMPANY, TARIFF_ID, { name: "x", ports: ["DEHAM"], directions: ["import"] })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("offers", () => {
  const BANDS = [
    { column: "D", label: "20'<14 t", minLengthFt: 20, maxLengthFt: 20, maxGrossTonnes: 14 },
    { column: "E", label: "20'<25 t", minLengthFt: 20, maxLengthFt: 20, maxGrossTonnes: 25 },
  ];
  const rate = (over: Partial<RouteRate>): RouteRate =>
    ({
      id: "rate-1",
      companyId: COMPANY,
      versionId: VERSION_ID,
      rowNo: 10,
      country: "CZ",
      postcode: "60200",
      postcodeFrom: "60200",
      postcodeTo: "60200",
      place: "Brno",
      region: "",
      via: "Praha",
      emptyDepot: "Praha",
      note: "",
      validFrom: null,
      validTo: null,
      prices: { "20ft-14t": 1020, "20ft-25t": 1139 },
      versionNo: 1,
      currency: "EUR",
      versionValidTo: "2026-12-31",
      bands: BANDS,
      tariffId: TARIFF_ID,
      tariffName: "Hamburg – Czechia",
      supplierCustomerId: METRANS.id,
      ...over,
    }) as RouteRate;
  const ask = (over: Partial<Parameters<typeof railTariffService.offers>[1]> = {}) =>
    railTariffService.offers(COMPANY, { port: "DEHAM", direction: "import", place: "602 00", date: "2026-11-15", containers: [{ type: "20' DC", qty: 2, cargoKg: 12_000 }], ...over });

  it("lists every row that prices the containers, cheapest first, each at its weight band", async () => {
    repo.ratesOnRoute.mockResolvedValue([
      rate({ id: "praha", via: "Praha" }),
      rate({ id: "cetr", via: "Cetr", postcodeFrom: "60000", postcodeTo: "64400", prices: { "20ft-14t": 781, "20ft-25t": 905 } }),
    ]);
    const result = await ask();
    expect(repo.ratesOnRoute).toHaveBeenCalledWith(COMPANY, { port: "DEHAM", direction: "import", date: "2026-11-15", country: "CZ", place: { postcode: "60200" } });
    expect(result.matchedBy).toBe("postcode");
    expect(result.containers[0]).toMatchObject({ tareKg: 2300, grossKg: 14_300 });
    expect(result.offers.map((o) => [o.via, o.lines[0]!.bandLabel, o.lines[0]!.price, o.total, o.supplierName])).toEqual([
      ["Cetr", "20'<25 t", 905, 1810, "METRANS a.s."],
      ["Praha", "20'<25 t", 1139, 2278, "METRANS a.s."],
    ]);
    expect(result.notes).toEqual([]);
  });

  it("shows rows asking the same of the same tariff via the same terminal once", async () => {
    repo.ratesOnRoute.mockResolvedValue([rate({ id: "a", place: "Brno" }), rate({ id: "b", place: "Brno-Slatina" })]);
    expect((await ask({ place: "Brno" })).offers.map((o) => o.rateId)).toEqual(["a"]);
  });

  it("says which rows could not price a container and which weight is missing", async () => {
    repo.ratesOnRoute.mockResolvedValue([rate({})]);
    const heavy = await ask({ containers: [{ type: "20' DC", qty: 1, cargoKg: 24_000 }] }); // 26.3 t
    expect(heavy.offers).toEqual([]);
    expect(heavy.notes).toEqual(["1 tariff row: 20' DC at 26.3 t gross is heavier than their weight bands - the operator prices it individually"]);
    const unweighed = await ask({ containers: [{ type: "20' DC", qty: 1, cargoKg: null }] });
    expect(unweighed.offers[0]!.lines[0]!.bandLabel).toBe("20'<14 t");
    expect(unweighed.notes[0]).toContain("no cargo weight");
  });

  it("leaves out the tariffs of a company that is no rail operator any more", async () => {
    repo.ratesOnRoute.mockResolvedValue([rate({ supplierCustomerId: "someone-else" })]);
    companiesWithRole.mockResolvedValue({ companies: [] });
    expect((await ask()).offers).toEqual([]);
  });

  it("asks nothing without a place, and looks a place without a postcode up by name", async () => {
    expect(await ask({ place: " " })).toMatchObject({ offers: [], matchedBy: null });
    expect(repo.ratesOnRoute).not.toHaveBeenCalled();
    repo.ratesOnRoute.mockResolvedValue([]);
    await ask({ place: "Ústí nad Labem", country: "cz" });
    expect(repo.ratesOnRoute).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ country: "CZ", place: { name: "Ústí nad Labem" } }));
  });

  it.each([
    ["a day that does not exist", { date: "2026-02-30" }],
    ["no containers", { containers: [] }],
    ["a number of containers that is no whole number", { containers: [{ type: "20' DC", qty: 1.5, cargoKg: null }] }],
    ["a country that is no code", { country: "Czechia" }],
  ])("refuses %s", async (_, over) => {
    await expect(ask(over)).rejects.toMatchObject({ code: "invalid_argument" });
  });
});
