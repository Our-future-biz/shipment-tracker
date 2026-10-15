import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The service runs for real against stand-ins for its repositories and the customers service.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({ customers: { _internalHaulierList: vi.fn(), _internalCustomerPipelineList: vi.fn() } }));
const repo = vi.hoisted(() => ({
  list: vi.fn(),
  find: vi.fn(),
  createTariff: vi.fn(),
  updateTariff: vi.fn(),
  versionSummaries: vi.fn(),
  findVersion: vi.fn(),
  bindingOn: vi.fn(),
  createVersion: vi.fn(),
  activate: vi.fn(),
  discard: vi.fn(),
}));
vi.mock("../repositories/tariff.repository", () => ({ tariffRepository: repo }));
const fuel = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("../services/fuelIndex.service", () => ({ fuelIndexService: fuel }));
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "Jana Nováková") }));

import { customers } from "~encore/clients";
import { tariffService } from "../services/tariff.service";
import type { TariffVersionInput } from "../interfaces/interfaces";

const C = "00000000-0000-0000-0000-000000000001";
const U = "00000000-0000-0000-0000-000000000002";
const T = "00000000-0000-0000-0000-0000000000a1";
const V = "00000000-0000-0000-0000-0000000000b1";
const H = "00000000-0000-0000-0000-0000000000c1";

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

const input = (over: Partial<TariffVersionInput> = {}): TariffVersionInput => ({
  validFrom: "2026-11-01",
  validTo: null,
  factors: { kgPerLdm: 1750, kgPerCbm: 250, kgPerPalletPlace: 400 },
  rounding: { weightStepKg: 1, moneyStep: 0.01 },
  zones: [{ code: "1", label: "CZ", postcodeFrom: "10000", postcodeTo: "79999", remote: false }],
  bands: [{ id: "b1", basis: "KG", fromExcl: 0, toIncl: null }],
  rates: [{ serviceLevel: "D1", zoneCode: "1", bandId: "b1", amount: 5, priceType: "PER_UNIT" }],
  minCharges: [],
  surcharges: [],
  notes: "",
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
  validFrom: "2026-11-01",
  validTo: null,
  input: input(),
  findings: [],
  serviceLevels: ["D1"],
  zoneCount: 1,
  warningCount: 0,
  errorCount: 0,
  createdByUserId: U,
  createdBy: "Jana Nováková",
  activatedAt: null,
  activatedBy: null,
  supersededAt: null,
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
  repo.find.mockResolvedValue(tariff());
  repo.versionSummaries.mockResolvedValue([]);
  repo.bindingOn.mockResolvedValue([]);
  fuel.list.mockResolvedValue([]);
  vi.mocked(customers._internalCustomerPipelineList).mockResolvedValue({ data: [{ id: H, companyName: "Rychlá doprava s.r.o.", status: "Active", label: "CLIENT", salesOwner: "", createdAt: "" }] } as never);
  vi.mocked(customers._internalHaulierList).mockResolvedValue({ hauliers: [] });
});

afterEach(() => vi.useRealTimers());

describe("tariffs", () => {
  it("lists tariffs with their active and next version and drafts", async () => {
    repo.list.mockResolvedValue([tariff({ side: "BUY", ownerCustomerId: H, name: "Rychlá LTL" })]);
    repo.versionSummaries.mockResolvedValue([
      version({ id: "v4", versionNo: 4 }),
      version({ id: "v3", versionNo: 3, activatedAt: new Date(), validFrom: "2026-12-01" }),
      version({ id: "v2", versionNo: 2, activatedAt: new Date(), validFrom: "2026-11-01" }),
      version({ id: "v1", versionNo: 1, activatedAt: new Date(), validFrom: "2026-01-01", validTo: "2026-10-31" }),
    ]);
    const [item] = await tariffService.list(C, { side: "BUY" });
    expect(item).toMatchObject({ ownerName: "Rychlá doprava s.r.o.", draftCount: 1, activeVersion: { id: "v1", status: "ACTIVE" }, nextVersion: { id: "v2", status: "SCHEDULED" } });
  });

  it("lets only a manager create, update or add versions", async () => {
    const create = { side: "SELL" as const, scope: "LTL" as const, mode: "MATRIX" as const, name: "Standard", ownerCustomerId: null, currency: "CZK" as const, zoneBy: "DESTINATION" as const, discountPercent: null };
    await expect(tariffService.create(C, U, "user", create)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(tariffService.update(C, U, "user", T, { name: "x" })).rejects.toMatchObject({ code: "permission_denied" });
    await expect(tariffService.createVersion(C, U, "user", T, input())).rejects.toMatchObject({ code: "permission_denied" });
    await expect(tariffService.activate(C, U, "user", V, "2026-11-01")).rejects.toMatchObject({ code: "permission_denied" });
    await expect(tariffService.discard(C, U, "user", V)).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("refuses a second tariff of the same side, scope and owner with 409", async () => {
    repo.createTariff.mockResolvedValue(null);
    const create = { side: "SELL" as const, scope: "LTL" as const, mode: "MATRIX" as const, name: "Standard", ownerCustomerId: null, currency: "CZK" as const, zoneBy: "DESTINATION" as const, discountPercent: null };
    await expect(tariffService.create(C, U, "manager", create)).rejects.toMatchObject({ code: "aborted" });
    expect(repo.createTariff.mock.calls[0][2]).toMatchObject({ kind: "tariff_created", byName: "Jana Nováková" });
  });

  it("refuses a buy tariff for a company that is not a haulier", async () => {
    const create = { side: "BUY" as const, scope: "LTL" as const, mode: "MATRIX" as const, name: "X", ownerCustomerId: H, currency: "EUR" as const, zoneBy: "DESTINATION" as const, discountPercent: null };
    await expect(tariffService.create(C, U, "admin", create)).rejects.toMatchObject({ code: "invalid_argument", message: "A buy tariff belongs to a haulier: this company is not one" });
  });

  it("refuses prices of its own on a discount tariff", async () => {
    repo.find.mockResolvedValue(tariff({ mode: "DISCOUNT", ownerCustomerId: H, discountPercent: 5 }));
    await expect(tariffService.createVersion(C, U, "manager", T, input())).rejects.toMatchObject({ code: "invalid_argument" });
  });
});

describe("versions", () => {
  it("saves a draft with its findings even when they hold errors", async () => {
    repo.createVersion.mockImplementation(async (_c, _t, values) => version({ ...values }));
    const bad = input({ rates: [{ serviceLevel: "D1", zoneCode: "9", bandId: "b1", amount: 5, priceType: "PER_UNIT" }] });
    const v = await tariffService.createVersion(C, U, "manager", T, bad);
    expect(v.status).toBe("DRAFT");
    expect(v.findings).toEqual([expect.objectContaining({ severity: "error", message: "Unknown zone 9" })]);
    const [, , values, event] = repo.createVersion.mock.calls[0];
    expect(values).toMatchObject({ errorCount: 1, serviceLevels: ["D1"], zoneCount: 1, createdBy: "Jana Nováková" });
    expect(event).toMatchObject({ kind: "tariff_version_created" });
  });

  it("refuses to activate a version with errors", async () => {
    repo.findVersion.mockResolvedValue(version({ input: input({ rates: [{ serviceLevel: "D1", zoneCode: "9", bandId: "b1", amount: 5, priceType: "PER_UNIT" }] }) }));
    await expect(tariffService.activate(C, U, "manager", V, "2026-11-01")).rejects.toMatchObject({
      code: "failed_precondition",
      message: "Fix the 1 error in this version before activating it",
    });
    expect(repo.activate).not.toHaveBeenCalled();
  });

  it("refuses a start in the past, after the version's end, or of a version already activated", async () => {
    repo.findVersion.mockResolvedValue(version());
    await expect(tariffService.activate(C, U, "manager", V, "2026-10-14")).rejects.toMatchObject({ code: "invalid_argument" });
    repo.findVersion.mockResolvedValue(version({ input: input({ validTo: "2026-10-31" }) }));
    await expect(tariffService.activate(C, U, "manager", V, "2026-11-01")).rejects.toMatchObject({ code: "invalid_argument" });
    repo.findVersion.mockResolvedValue(version({ activatedAt: new Date() }));
    await expect(tariffService.activate(C, U, "manager", V, "2026-11-01")).rejects.toMatchObject({ code: "aborted" });
  });

  it("activates a clean draft from the chosen day, checked against the version binding today", async () => {
    const active = version({ id: "old", activatedAt: new Date(), validFrom: "2026-01-01", input: input({ rates: [{ serviceLevel: "D1", zoneCode: "1", bandId: "b1", amount: 4, priceType: "PER_UNIT" }] }) });
    repo.findVersion.mockResolvedValue(version());
    repo.bindingOn.mockResolvedValue([active]);
    repo.activate.mockImplementation(async (_c, _id, values) => ({ ok: true, version: version({ ...values, activatedAt: new Date() }) }));
    const v = await tariffService.activate(C, U, "manager", V, "2026-10-20");
    expect(v).toMatchObject({ status: "SCHEDULED", validFrom: "2026-10-20", warningCount: 1 });
    const [, id, values, event] = repo.activate.mock.calls[0];
    expect(id).toBe(V);
    expect(values).toMatchObject({ validFrom: "2026-10-20", validTo: null, activatedBy: "Jana Nováková", errorCount: 0 });
    expect(values.findings[0].message).toBe("1 prices change by more than 15 % against the active version");
    expect(event).toMatchObject({ kind: "tariff_version_activated", payload: { changes: { validFrom: { before: "2026-11-01", after: "2026-10-20" } } } });
  });

  it("answers 409 when the activation would overlap another binding version", async () => {
    repo.findVersion.mockResolvedValue(version());
    repo.activate.mockResolvedValue({ ok: false, reason: "overlap" });
    await expect(tariffService.activate(C, U, "manager", V, "2026-11-01")).rejects.toMatchObject({ code: "aborted" });
  });

  it("discards drafts only", async () => {
    repo.findVersion.mockResolvedValue(version({ activatedAt: new Date() }));
    await expect(tariffService.discard(C, U, "manager", V)).rejects.toMatchObject({ code: "failed_precondition" });
    repo.findVersion.mockResolvedValue(version());
    repo.discard.mockResolvedValue(version({ deletedAt: new Date() }));
    await tariffService.discard(C, U, "manager", V);
    expect(repo.discard.mock.calls[0][2]).toMatchObject({ kind: "tariff_version_discarded" });
  });
});
