import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({ customers: { _internalCompaniesWithRole: vi.fn() }, auth: { placeLookup: vi.fn() } }));
vi.mock("../../../lib/userNames", () => ({ userRefs: vi.fn(async () => new Map([["user-1", { name: "Jana Nová", email: "", role: "manager" }]])) }));
vi.mock("../storage/tariffFileBucket", () => ({ tariffFileBucket: { upload: vi.fn(), remove: vi.fn(async () => undefined), download: vi.fn() } }));
vi.mock("../services/oceanLayoutReader.service", () => ({ readOceanLayout: vi.fn() }));
vi.mock("../repositories/tariff.repository", () => ({
  tariffRepository: {
    list: vi.fn(),
    get: vi.fn(),
    versionsOf: vi.fn(),
    getVersion: vi.fn(),
    createDraft: vi.fn(),
    approve: vi.fn(),
    update: vi.fn(),
    oceanPorts: vi.fn(),
    pendingOceanPorts: vi.fn(),
    setOceanPort: vi.fn(),
    oceanPicks: vi.fn(),
    replaceFindings: vi.fn(),
    oceanCandidates: vi.fn(),
    oceanRoute: vi.fn(),
  },
}));

import { auth, customers } from "~encore/clients";
import type { OceanData, OceanLayout, OceanPlace } from "../interfaces/interfaces";
import { tariffRepository, type OceanRateWithPorts } from "../repositories/tariff.repository";
import type { TariffRecord, TariffVersionRecord } from "../schemas/tariff.schema";
import { readOceanLayout } from "../services/oceanLayoutReader.service";
import { oceanTariffService } from "../services/oceanTariff.service";

const COMPANY = "company-1";
const ACTOR = { userID: "user-1", companyID: COMPANY, role: "manager" };
const OOCL = { id: "11111111-1111-4111-8111-111111111111", companyName: "OOCL (Deutschland) GmbH", ico: "", dic: "", city: "Hamburg", country: "DE" };
const TARIFF_ID = "55555555-5555-4555-8555-555555555555";
const VERSION_ID = "44444444-4444-4444-8444-444444444444";

const repo = vi.mocked(tariffRepository);
const placeLookup = vi.mocked(auth.placeLookup);
const place = (code: string, name: string): OceanPlace => ({ code, name, countryCode: code.slice(0, 2), subdivisionName: null });

// A one-sheet CSV rate document: two rows of ports and prices.
const CSV = "POL;POD;20' Box;40' Box\nHAM / RTM;Shanghai;25;25\nHAM;Fuzhou;200;350\n";
const LAYOUT: OceanLayout = {
  name: "OOCL Export FAK",
  validFrom: "2026-05-01",
  validTo: "2026-05-31",
  tables: [
    {
      label: "Far East",
      sheet: "OOCL",
      headerRow: 1,
      firstDataRow: 2,
      lastDataRow: null,
      pol: "A",
      polFixed: null,
      pod: "B",
      via: null,
      currency: null,
      currencyFixed: "USD",
      prices: [
        { column: "C", equipment: "20DC", label: "20' Box" },
        { column: "D", equipment: "40DC", label: "40' Box" },
      ],
      note: null,
      podCountries: ["CN"],
    },
  ],
  portCodes: { HAM: "DEHAM", RTM: "NLRTM" },
  surcharges: [
    { name: "EBS Emergency Bunker Surcharge", code: "EBS", amount: 70, currency: "USD", basis: "teu", equipment: ["dry"], tables: [0], countries: [], exceptCountries: ["TW"], ports: [], exceptPorts: [], condition: "always", charge: "fcl_baf" },
    { name: "DOC", code: "DOC", amount: 75, currency: "EUR", basis: "bl", equipment: [], tables: [], countries: [], exceptCountries: [], ports: [], exceptPorts: [], condition: "manual_booking", charge: "fcl_documentation" },
  ],
  conditions: [],
  links: [],
};

const upload = (extra: Partial<Parameters<typeof oceanTariffService.upload>[1]> = {}) =>
  oceanTariffService.upload(ACTOR, { supplierCustomerId: OOCL.id, directions: ["export"], fileName: "OOCL.csv", fileBase64: Buffer.from(CSV).toString("base64"), ...extra });

const version = (over: Partial<TariffVersionRecord> = {}): TariffVersionRecord =>
  ({ id: VERSION_ID, tariffId: TARIFF_ID, versionNo: 1, status: "draft", validFrom: "2026-05-01", validTo: "2026-05-31", currency: "USD", layout: LAYOUT, findings: [], preview: [], createdAt: new Date(), ...over }) as TariffVersionRecord;
const tariff = (over: Partial<TariffRecord> = {}): TariffRecord =>
  ({ id: TARIFF_ID, companyId: COMPANY, supplierCustomerId: OOCL.id, mode: "ocean", name: "OOCL Export FAK", ports: [], directions: ["export"], freightModes: [], layout: null, ...over }) as TariffRecord;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(customers._internalCompaniesWithRole).mockImplementation(async ({ ids }) => ({ companies: [OOCL].filter((c) => !ids || ids.includes(c.id)) }));
  vi.mocked(readOceanLayout).mockResolvedValue(LAYOUT);
  // The place list: HAM and RTM are known codes; Shanghai has one place, Fuzhou two.
  placeLookup.mockImplementation(async ({ codes, names }) => ({
    byCode: codes.filter((c) => ["DEHAM", "NLRTM", "CNFOC"].includes(c)).map((c) => place(c, c)),
    candidates: names.map((n) => (n.name === "Shanghai" ? [place("CNSHA", "Shanghai")] : n.name === "Fuzhou" ? [place("CNFOC", "Fuzhou"), place("CNFZH", "Fuzhou")] : [])),
  }));
  repo.createDraft.mockResolvedValue(version());
  repo.getVersion.mockResolvedValue(version());
  repo.get.mockResolvedValue(tariff());
  repo.oceanPorts.mockResolvedValue([]);
  repo.oceanPicks.mockResolvedValue([]);
  repo.pendingOceanPorts.mockResolvedValue(0);
});

describe("upload", () => {
  it("reads every rate and matches the ports: the tariff's codes, one place by name, the rest to pick", async () => {
    await upload();
    const [, target, fields, data] = repo.createDraft.mock.calls[0]!;
    expect(target).toEqual({ supplierCustomerId: OOCL.id, mode: "ocean", name: "OOCL Export FAK", ports: [], directions: ["export"] });
    const { rates, ports } = data as OceanData;
    expect(rates.map((r) => [r.polName, r.podName, r.prices])).toEqual([
      ["HAM", "Shanghai", { "20DC": 25, "40DC": 25 }],
      ["RTM", "Shanghai", { "20DC": 25, "40DC": 25 }],
      ["HAM", "Fuzhou", { "20DC": 200, "40DC": 350 }],
    ]);
    expect(ports.map((p) => [p.side, p.name, p.code, p.status, p.candidates.length])).toEqual([
      ["pol", "HAM", "DEHAM", "matched", 0],
      ["pol", "RTM", "NLRTM", "matched", 0],
      ["pod", "Shanghai", "CNSHA", "matched", 0],
      ["pod", "Fuzhou", null, "pending", 2],
    ]);
    expect(fields).toMatchObject({ rowCount: 3, currency: "USD", findings: [expect.objectContaining({ code: "ports_pending", count: 1 })] });
  });

  it("takes over the ports a user picked on the tariff's earlier versions", async () => {
    repo.get.mockResolvedValue(tariff());
    repo.oceanPicks.mockResolvedValue([{ side: "pod", name: "Fuzhou", code: "CNFOC", status: "manual" }]);
    await upload({ tariffId: TARIFF_ID });
    const { ports } = repo.createDraft.mock.calls[0]![3] as OceanData;
    expect(ports.find((p) => p.name === "Fuzhou")).toMatchObject({ code: "CNFOC", status: "manual" });
  });

  it("refuses a new tariff without import / export before asking the AI, and another kind of tariff", async () => {
    await expect(upload({ directions: [] })).rejects.toMatchObject({ code: "invalid_argument" });
    repo.get.mockResolvedValue(tariff({ mode: "rail" }));
    await expect(upload({ tariffId: TARIFF_ID })).rejects.toMatchObject({ code: "not_found" });
    expect(readOceanLayout).not.toHaveBeenCalled();
  });
});

describe("ports and approval", () => {
  it("sets a port a user picked, when the place list has it, and recounts what is left", async () => {
    repo.setOceanPort.mockResolvedValue({ side: "pod", name: "Fuzhou", code: "CNFOC", status: "manual" } as never);
    repo.getVersion.mockResolvedValue(version({ findings: [{ level: "warning", code: "ports_pending", message: "1", count: 1, rows: [] }] }));
    await oceanTariffService.setPort(COMPANY, VERSION_ID, { side: "pod", name: "Fuzhou", code: "cnfoc" });
    expect(repo.setOceanPort).toHaveBeenCalledWith(VERSION_ID, "pod", "Fuzhou", "CNFOC");
    expect(repo.replaceFindings).toHaveBeenCalledWith(COMPANY, VERSION_ID, [], { errors: 0, warnings: 0 });
    await expect(oceanTariffService.setPort(COMPANY, VERSION_ID, { side: "pod", name: "Fuzhou", code: "XXXXX" })).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("leaves a port out with no code, but only on a draft", async () => {
    repo.setOceanPort.mockResolvedValue({} as never);
    await oceanTariffService.setPort(COMPANY, VERSION_ID, { side: "pod", name: "Fuzhou", code: null });
    expect(repo.setOceanPort).toHaveBeenCalledWith(VERSION_ID, "pod", "Fuzhou", null);
    repo.getVersion.mockResolvedValue(version({ status: "active" }));
    await expect(oceanTariffService.setPort(COMPANY, VERSION_ID, { side: "pod", name: "Fuzhou", code: null })).rejects.toMatchObject({ code: "failed_precondition" });
  });

  it("waits with approval while a port is still to pick", async () => {
    repo.pendingOceanPorts.mockResolvedValue(3);
    await expect(oceanTariffService.approve(ACTOR, VERSION_ID)).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringContaining("3 port names") });
    expect(repo.approve).not.toHaveBeenCalled();
  });

  it("does not find a version of another kind of tariff", async () => {
    repo.get.mockResolvedValue(tariff({ mode: "collection" }));
    await expect(oceanTariffService.version(COMPANY, VERSION_ID)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("offers", () => {
  const rate = (over: Partial<OceanRateWithPorts>): OceanRateWithPorts =>
    ({ id: "r1", versionId: VERSION_ID, tableNo: 0, rowNo: 2, polName: "HAM", podName: "Shanghai", via: "", currency: "USD", prices: { "20DC": 25, "40DC": 25 }, note: "", polCode: "DEHAM", podCode: "CNSHA", ...over }) as OceanRateWithPorts;
  const ask = (over: Partial<Parameters<typeof oceanTariffService.offers>[1]> = {}) =>
    oceanTariffService.offers(COMPANY, { direction: "export", polCode: "DEHAM", podCode: "CNSHA", comparePols: false, date: "2026-05-15", containers: [{ type: "40' DC", qty: 2 }], dangerous: false, ...over });

  beforeEach(() => {
    repo.oceanCandidates.mockResolvedValue([{ version: version({ status: "active" }), tariff: tariff() }]);
    repo.oceanRoute.mockResolvedValue([rate({ id: "dear", prices: { "40DC": 400 } }), rate({ id: "cheap" }), rate({ id: "no40", prices: { "20DC": 10 } })]);
  });

  it("prices every rate on the route with its surcharges, cheapest first", async () => {
    const result = await ask();
    expect(repo.oceanCandidates).toHaveBeenCalledWith(COMPANY, "export", "2026-05-15");
    expect(repo.oceanRoute).toHaveBeenCalledWith([VERSION_ID], "CNSHA", "DEHAM");
    expect(result.offers.map((o) => [o.rateId, o.freight, o.surcharges.map((s) => [s.code, s.total]), o.totals])).toEqual([
      ["cheap", 50, [["EBS", 280]], [{ currency: "USD", amount: 330 }]],
      ["dear", 800, [["EBS", 280]], [{ currency: "USD", amount: 1080 }]],
    ]);
    expect(result.notes).toEqual([
      "1 rate has no price for one of the containers and is left out",
      "Only on a booking or B/L made by hand, not added: DOC",
      "Origin and destination local charges are not included: see the shipping line's own tariff",
    ]);
  });

  it("asks every port of loading when compared, and names the containers the tariffs do not price", async () => {
    const result = await ask({ comparePols: true, containers: [{ type: "40' DC", qty: 1 }, { type: "40' FR", qty: 1 }] });
    expect(repo.oceanRoute).toHaveBeenCalledWith([VERSION_ID], "CNSHA", null);
    expect(result.notes[0]).toContain("40' FR is not in the shipping lines' tariffs");
  });

  it("refuses a port that is no UN/LOCODE, a day that does not exist, and no containers", async () => {
    await expect(ask({ podCode: "Shanghai" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(ask({ date: "2026-02-30" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(ask({ containers: [] })).rejects.toMatchObject({ code: "invalid_argument" });
  });
});
