import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({ customers: { _internalCompaniesWithRole: vi.fn() } }));
vi.mock("../../../lib/userNames", () => ({ userRefs: vi.fn(async () => new Map([["user-1", { name: "Jana Nová", email: "", role: "manager" }]])) }));
vi.mock("../storage/tariffFileBucket", () => ({ tariffFileBucket: { upload: vi.fn(), remove: vi.fn(async () => undefined), download: vi.fn() } }));
vi.mock("../services/collectionLayoutReader.service", () => ({ readCollectionLayout: vi.fn() }));
vi.mock("../services/railLayoutReader.service", () => ({ readRailLayout: vi.fn() }));
vi.mock("../repositories/tariff.repository", () => ({
  tariffRepository: {
    list: vi.fn(),
    get: vi.fn(),
    versionsOf: vi.fn(),
    getVersion: vi.fn(),
    createDraft: vi.fn(),
    approve: vi.fn(),
    update: vi.fn(),
    regionOf: vi.fn(),
    distanceBetween: vi.fn(),
    areaOf: vi.fn(),
    collectionRates: vi.fn(),
    collectionCounts: vi.fn(),
    collectionCandidates: vi.fn(),
    hubs: vi.fn(),
    setHub: vi.fn(),
  },
}));

import { customers } from "~encore/clients";
import type { CollectionData, CollectionLayout } from "../interfaces/interfaces";
import { tariffRepository } from "../repositories/tariff.repository";
import type { CollectionRateRecord, TariffRecord, TariffVersionRecord } from "../schemas/tariff.schema";
import { readCollectionLayout } from "../services/collectionLayoutReader.service";
import { collectionTariffService } from "../services/collectionTariff.service";
import { railTariffService } from "../services/railTariff.service";

const COMPANY = "company-1";
const ACTOR = { userID: "user-1", companyID: COMPANY, role: "manager" };
const TOPTRANS = { id: "11111111-1111-4111-8111-111111111111", companyName: "TOPTRANS EU, a.s.", ico: "", dic: "", city: "Brno", country: "CZ" };
const OTHER = { ...TOPTRANS, id: "22222222-2222-4222-8222-222222222222", companyName: "Rychlá doprava s.r.o." };
const TARIFF_ID = "55555555-5555-4555-8555-555555555555";
const VERSION_ID = "44444444-4444-4444-8444-444444444444";
const VERSION_2 = "66666666-6666-4666-8666-666666666666";

const repo = vi.mocked(tariffRepository);
const companiesWithRole = vi.mocked(customers._internalCompaniesWithRole);

const zones = (cols: string[]) => cols.map((column, i) => ({ column, label: `Zone ${i + 1}`, kmTo: null, zone: String(i + 1) }));

// A one-sheet CSV tariff: a price table (rows 3-4) and its postcode areas (rows 7-8).
const CSV = "Ceník;;\ndo kg;Zone 1;Zone 2\n5;100;150\n30;200;250\n;;\nPSČ;Zone;\n1xxxx;1;\n6xxxx;2;\n";
const LAYOUT: CollectionLayout = {
  name: "Rychlá – CZ",
  currency: "CZK",
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  zoneBy: "postcode",
  matrices: [{ label: "CZ → CZ", country: "CZ", sheet: "Rychla", headerRow: 2, firstDataRow: 3, lastDataRow: 4, weightTo: "A", volumeTo: null, zones: zones(["B", "C"]) }],
  kgPerCbm: 250,
  regions: null,
  distances: null,
  sameRegionKm: null,
  areas: { sheet: "Rychla", firstDataRow: 7, lastDataRow: null, postcodeFrom: "A", postcodeTo: null, zone: "B", country: null, defaultCountry: "CZ" },
  surcharges: [],
  conditions: [],
  links: [],
};
const DISTANCE_LAYOUT: CollectionLayout = {
  ...LAYOUT,
  name: "TOPTRANS",
  zoneBy: "distance",
  matrices: [{ ...LAYOUT.matrices[0]!, zones: [{ column: "B", label: "100 km", kmTo: 100, zone: null }, { column: "C", label: "300 km", kmTo: 300, zone: null }] }],
  areas: null,
  regions: { sheet: "x", firstDataRow: 1, lastDataRow: null, postcode: "A", region: "B", country: null, place: null, countryCodes: {}, defaultCountry: "CZ" },
  distances: { sheet: "x", firstDataRow: 1, lastDataRow: null, fromRegion: "A", toRegion: "B", km: "C" },
  sameRegionKm: 50,
};

const upload = (extra: Partial<Parameters<typeof collectionTariffService.upload>[1]> = {}) =>
  collectionTariffService.upload(ACTOR, { supplierCustomerId: OTHER.id, freightModes: ["air", "sea_lcl"], fileName: "Rychla.csv", fileBase64: Buffer.from(CSV).toString("base64"), ...extra });

const version = (over: Partial<TariffVersionRecord> = {}): TariffVersionRecord =>
  ({ id: VERSION_ID, tariffId: TARIFF_ID, versionNo: 1, status: "active", validFrom: "2026-01-01", validTo: "2026-12-31", currency: "CZK", layout: LAYOUT, findings: [], preview: [], createdAt: new Date(), ...over }) as TariffVersionRecord;
const tariff = (over: Partial<TariffRecord> = {}): TariffRecord =>
  ({ id: TARIFF_ID, companyId: COMPANY, supplierCustomerId: OTHER.id, mode: "collection", name: "Rychlá – CZ", ports: [], directions: [], freightModes: ["sea_lcl"], layout: null, ...over }) as TariffRecord;
const rate = (matrix: number, weightToKg: number, prices: number[]): CollectionRateRecord => ({ matrix, weightToKg, volumeToCbm: null, prices, rowNo: 1 }) as CollectionRateRecord;

beforeEach(() => {
  vi.clearAllMocks();
  // As the Customer Database answers: the role's companies, those of `ids` when named.
  companiesWithRole.mockImplementation(async ({ ids }) => ({ companies: [TOPTRANS, OTHER].filter((c) => !ids || ids.includes(c.id)) }));
  vi.mocked(readCollectionLayout).mockResolvedValue(LAYOUT);
  repo.createDraft.mockResolvedValue(version({ status: "draft" }));
  repo.getVersion.mockResolvedValue(version({ status: "draft" }));
  repo.get.mockResolvedValue(tariff());
  repo.collectionRates.mockResolvedValue([]);
  repo.collectionCounts.mockResolvedValue({ rates: 2, regions: 0, distances: 0, areas: 2 });
  repo.hubs.mockResolvedValue([{ freightMode: "sea_lcl", postcode: "25261", country: "CZ", label: "CFS Jeneč" }]);
});

describe("upload", () => {
  it("reads a new tariff's file into a draft with its freight, every price row and postcode area", async () => {
    await upload();
    expect(companiesWithRole).toHaveBeenCalledWith({ role: "first_last_mile_haulier", ids: [OTHER.id] });
    const [, target, fields, data] = repo.createDraft.mock.calls[0]!;
    expect(target).toEqual({ supplierCustomerId: OTHER.id, mode: "collection", name: "Rychlá – CZ", ports: [], directions: [], freightModes: ["sea_lcl", "air"] });
    expect(fields).toMatchObject({ layoutSource: "ai", rowCount: 2, errorCount: 0, currency: "CZK", validTo: "2026-12-31" });
    const { rates, areas } = data as CollectionData;
    expect(rates.map((r) => [r.weightToKg, r.prices])).toEqual([
      [5, [100, 150]],
      [30, [200, 250]],
    ]);
    expect(areas.map((a) => [a.postcodeFrom, a.postcodeTo, a.zone])).toEqual([
      ["10000", "19999", "1"],
      ["60000", "69999", "2"],
    ]);
  });

  it("refuses a new tariff without its freight before asking the AI, and a tariff that is not the haulier's collections tariff", async () => {
    await expect(upload({ freightModes: [] })).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringContaining("Sea LCL, Air or both") });
    repo.get.mockResolvedValue(tariff({ mode: "rail" }));
    await expect(upload({ tariffId: TARIFF_ID })).rejects.toMatchObject({ code: "not_found" });
    companiesWithRole.mockResolvedValueOnce({ companies: [] });
    await expect(upload()).rejects.toMatchObject({ code: "not_found" });
    expect(readCollectionLayout).not.toHaveBeenCalled();
  });
});

describe("rail and collections keep to their own versions", () => {
  it("a rail endpoint does not find a collections version, nor the other way round", async () => {
    await expect(railTariffService.version(COMPANY, VERSION_ID)).rejects.toMatchObject({ code: "not_found" });
    repo.get.mockResolvedValue(tariff({ mode: "rail" }));
    await expect(collectionTariffService.version(COMPANY, VERSION_ID)).rejects.toMatchObject({ code: "not_found" });
    await expect(collectionTariffService.approve(ACTOR, VERSION_ID)).rejects.toMatchObject({ code: "not_found" });
    expect(repo.approve).not.toHaveBeenCalled();
  });
});

describe("offers", () => {
  const ask = (over: Partial<Parameters<typeof collectionTariffService.offers>[1]> = {}) =>
    collectionTariffService.offers(COMPANY, { freightMode: "sea_lcl", customerPostcode: "602 00", date: "2026-11-15", weightKg: 120, cbm: 0.3, longestCm: 100, ...over });

  beforeEach(() => {
    repo.collectionCandidates.mockResolvedValue([
      { version: version({ id: VERSION_ID, layout: DISTANCE_LAYOUT }), tariff: tariff({ supplierCustomerId: TOPTRANS.id, name: "TOPTRANS" }) },
      { version: version({ id: VERSION_2, layout: LAYOUT }), tariff: tariff() },
    ]);
    repo.regionOf.mockImplementation(async (_company, _version, postcode) => ({ postcode, region: postcode === "25261" ? "15" : "58", country: "CZ", place: postcode === "25261" ? "Dobrovíz" : "Brno" }) as never);
    repo.distanceBetween.mockResolvedValue(206);
    repo.areaOf.mockResolvedValue({ zone: "2", country: "CZ" });
    repo.collectionRates.mockImplementation(async (_company, versionId) => (versionId === VERSION_ID ? [rate(0, 150, [900, 1435])] : [rate(0, 150, [1000, 1200])]));
  });

  it("asks every approved tariff for the freight and lists their prices cheapest first, from our hub for the freight", async () => {
    const result = await ask();
    expect(repo.collectionCandidates).toHaveBeenCalledWith(COMPANY, "sea_lcl", "2026-11-15");
    expect(repo.regionOf).toHaveBeenCalledWith(COMPANY, VERSION_ID, "25261");
    expect(result.hubPostcode).toBe("25261");
    expect(result.offers.map((o) => [o.supplierName, o.zoneLabel, o.distanceKm, o.total, o.hubPlace, o.customerPlace])).toEqual([
      ["Rychlá doprava s.r.o.", "Zone 2", null, 1200, "", ""],
      ["TOPTRANS EU, a.s.", "300 km", 206, 1435, "Dobrovíz", "Brno"],
    ]);
    expect(result.notes).toEqual([]);
  });

  it("says why a tariff has no price, and what is missing", async () => {
    repo.regionOf.mockResolvedValue(null);
    repo.areaOf.mockResolvedValue(null);
    const result = await ask({ hubPostcode: "252 61" });
    expect(result.offers).toEqual([]);
    expect(result.notes).toEqual([
      "TOPTRANS EU, a.s. (TOPTRANS): our hub's postcode 252 61 is not in its postcode list",
      "Rychlá doprava s.r.o. (Rychlá – CZ): postcode 602 00 is in none of its areas",
    ]);
    repo.hubs.mockResolvedValue([]);
    expect((await ask({ freightMode: "air" })).notes[0]).toContain("Our hub for Air is not set");
    expect((await ask({ customerPostcode: "Brno" })).notes).toContain("Type the customer's 5-digit postcode");
  });

  it("says when the consignment is over a tariff's heaviest band", async () => {
    const result = await ask({ weightKg: 400 });
    expect(result.notes[0]).toContain("400 kg is over its heaviest band (150 kg)");
  });

  it("refuses a day that does not exist or a freight it does not know", async () => {
    await expect(ask({ date: "2026-02-30" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(ask({ freightMode: "road" as never })).rejects.toMatchObject({ code: "invalid_argument" });
  });
});

describe("try a route", () => {
  it("prices one version between two postcodes, a draft too", async () => {
    repo.areaOf.mockResolvedValue({ zone: "1", country: "CZ" });
    repo.collectionRates.mockResolvedValue([rate(0, 5, [100, 150]), rate(0, 30, [200, 250])]);
    const tried = await collectionTariffService.tryRoute(COMPANY, VERSION_ID, { hubPostcode: "25261", customerPostcode: "11000", weightKg: 4, cbm: 0.1, longestCm: null });
    // Read from the company's own rows of the version.
    expect(repo.areaOf).toHaveBeenCalledWith(COMPANY, VERSION_ID, "11000");
    expect(repo.collectionRates).toHaveBeenCalledWith(COMPANY, VERSION_ID);
    // 0.1 m³ × 250 kg/m³ = 25 kg counts more than the 4 kg it weighs.
    expect(tried).toMatchObject({ problem: null, price: { zoneLabel: "Zone 1", chargeableKg: 25, chargeableBy: "volume", bandLabel: "up to 30 kg", total: 200 } });
  });

  it("refuses a weight, volume or piece out of range, as the offers do", async () => {
    const route = { hubPostcode: "25261", customerPostcode: "11000", weightKg: 4, cbm: 0.1, longestCm: null };
    await expect(collectionTariffService.tryRoute(COMPANY, VERSION_ID, { ...route, weightKg: -1 })).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringContaining("weight") });
    await expect(collectionTariffService.tryRoute(COMPANY, VERSION_ID, { ...route, cbm: Number.NaN })).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringContaining("volume") });
    expect(repo.getVersion).not.toHaveBeenCalled();
  });
});

describe("hubs and tariff changes", () => {
  it("sets a hub with its postcode as 5 digits and the country in capitals", async () => {
    const saved = await collectionTariffService.setHub(ACTOR, { freightMode: "air", postcode: "161 00", country: "cz", label: " Letiště Praha " });
    expect(saved).toEqual({ freightMode: "air", postcode: "16100", country: "CZ", label: "Letiště Praha" });
    expect(repo.setHub).toHaveBeenCalledWith(COMPANY, saved, "Jana Nová");
    await expect(collectionTariffService.setHub(ACTOR, { freightMode: "air", postcode: "1610", country: "CZ", label: "" })).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("renames a tariff and changes its freight, but not a rail tariff's", async () => {
    repo.update.mockResolvedValue(tariff({ name: "Rychlá", freightModes: ["sea_lcl", "air"] }));
    expect(await collectionTariffService.update(COMPANY, TARIFF_ID, { name: " Rychlá ", freightModes: ["air", "sea_lcl"] })).toEqual({ id: TARIFF_ID, name: "Rychlá", freightModes: ["sea_lcl", "air"] });
    expect(repo.update).toHaveBeenCalledWith(COMPANY, TARIFF_ID, { name: "Rychlá", freightModes: ["sea_lcl", "air"] });
    repo.get.mockResolvedValue(tariff({ mode: "rail" }));
    await expect(collectionTariffService.update(COMPANY, TARIFF_ID, { name: "x", freightModes: ["air"] })).rejects.toMatchObject({ code: "not_found" });
  });
});
