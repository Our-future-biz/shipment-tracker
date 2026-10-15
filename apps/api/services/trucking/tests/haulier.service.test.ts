import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The service runs for real against stand-ins for its repository, the settings and the
// customers service (no database or Encore runtime under vitest).
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({ customers: { _internalHaulierList: vi.fn() } }));
const repo = vi.hoisted(() => ({ find: vi.fn(), listWithLaneCounts: vi.fn(), save: vi.fn() }));
vi.mock("../repositories/haulier.repository", () => ({ haulierRepository: repo }));
vi.mock("../services/settings.service", () => ({ settingsService: { vehicleCodes: vi.fn(async () => ["van", "tautliner_136"]) } }));
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "Jana Nováková") }));

import { customers } from "~encore/clients";
import { haulierService } from "../services/haulier.service";
import type { HaulierProfileInput } from "../interfaces/interfaces";

const C = "00000000-0000-0000-0000-000000000001";
const U = "00000000-0000-0000-0000-000000000002";
const H = "00000000-0000-0000-0000-0000000000a1";
const H2 = "00000000-0000-0000-0000-0000000000a2";
const haulierList = vi.mocked(customers._internalHaulierList);
const company = (id: string, companyName: string) => ({ id, companyName, ico: "12345678", dic: "CZ12345678", city: "Brno" });

const record = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  companyId: C,
  customerId: H,
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
  costSplitBasis: "chargeable_weight",
  blocked: false,
  blockReason: "",
  blockedAt: null,
  blockedBy: null,
  notes: "",
  version: 4,
  ...over,
});

const input = (over: Partial<HaulierProfileInput> = {}): HaulierProfileInput => ({
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
  costSplitBasis: "chargeable_weight",
  notes: "",
  preferredLanes: [],
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
  haulierList.mockImplementation(async ({ ids }: { ids?: string[] }) => ({
    hauliers: [company(H, "Bravo Trans"), company(H2, "Alfa Cargo")].filter((h) => !ids || ids.includes(h.id)),
  }));
  repo.find.mockResolvedValue(null);
  repo.listWithLaneCounts.mockResolvedValue([]);
});

afterEach(() => vi.useRealTimers());

describe("haulier list and detail", () => {
  it("lists a haulier without a profile as blocked: no insurance, no licence", async () => {
    repo.listWithLaneCounts.mockResolvedValue([{ profile: record(), laneCount: 2 }]);
    const list = await haulierService.list(C, {});
    expect(list.map((h) => h.companyName)).toEqual(["Alfa Cargo", "Bravo Trans"]);
    expect(list[0]).toMatchObject({ hasProfile: false, status: "blocked", preferredLaneCount: 0 });
    expect(list[0].issues.map((i) => i.code)).toEqual(["missing_insurance", "missing_licence"]);
    expect(list[1]).toMatchObject({ hasProfile: true, status: "ok", issues: [], preferredLaneCount: 2, vehicleTypes: ["van"] });
    expect(await haulierService.list(C, { status: "ok" })).toHaveLength(1);
    expect((await haulierService.list(C, { search: "alfa" })).map((h) => h.customerId)).toEqual([H2]);
  });

  it("answers 404 for a company that is not a haulier, and defaults at version 0 for one without profile", async () => {
    await expect(haulierService.get(C, "00000000-0000-0000-0000-0000000000ff")).rejects.toMatchObject({ code: "not_found" });
    await expect(haulierService.get(C, "nope")).rejects.toMatchObject({ code: "not_found" });
    const d = await haulierService.get(C, H2);
    expect(d).toMatchObject({ companyName: "Alfa Cargo", dic: "CZ12345678", status: "blocked", profile: { version: 0, paymentDays: 30, costSplitBasis: "chargeable_weight" } });
  });

  it("is usable only without block issues", async () => {
    repo.find.mockResolvedValue({ profile: record({ vatCheckedAt: null }), lanes: [] });
    expect(await haulierService.usable(C, H)).toEqual({ usable: true, issues: [expect.objectContaining({ code: "vat_check_due", severity: "warn" })] });
    repo.find.mockResolvedValue({ profile: record({ insuranceValidTo: "2026-10-14" }), lanes: [] });
    expect((await haulierService.usable(C, H)).usable).toBe(false);
  });
});

describe("haulier profile save", () => {
  it("refuses a stale version with 409", async () => {
    repo.find.mockResolvedValue({ profile: record(), lanes: [] });
    await expect(haulierService.update(C, U, H, input({ notes: "x" }), 3)).rejects.toMatchObject({
      code: "aborted",
      message: "The haulier was changed by someone else. Reload and try again.",
    });
    repo.save.mockResolvedValue(null);
    await expect(haulierService.update(C, U, H, input({ notes: "x" }), 4)).rejects.toMatchObject({ code: "aborted" });
  });

  it("saves the changed fields as one event, with normalised lanes", async () => {
    repo.find.mockResolvedValue({ profile: record(), lanes: [] });
    repo.save.mockResolvedValue(record({ version: 5 }));
    const lane = { originPostcodeFrom: "110 00", originPostcodeTo: "19999", destPostcodeFrom: "60000", destPostcodeTo: "69999", serviceKind: "FTL" as const, note: "" };
    await haulierService.update(C, U, H, input({ paymentDays: 45, preferredLanes: [lane] }), 4);
    const [, , version, values, lanes, event] = repo.save.mock.calls[0];
    expect(version).toBe(4);
    expect(values).not.toHaveProperty("blocked");
    expect(lanes).toEqual([{ ...lane, originPostcodeFrom: "11000" }]);
    expect(event).toMatchObject({ kind: "profile_updated", byName: "Jana Nováková", payload: { changes: { paymentDays: { before: 30, after: 45 } } } });
    expect(Object.keys(event.payload.changes).sort()).toEqual(["paymentDays", "preferredLanes"]);
  });

  it("refuses a lane whose postcodes run backwards", async () => {
    const lane = { originPostcodeFrom: "19999", originPostcodeTo: "11000", destPostcodeFrom: "60000", destPostcodeTo: "69999", serviceKind: "ANY" as const, note: "" };
    await expect(haulierService.update(C, U, H, input({ preferredLanes: [lane] }), 0)).rejects.toMatchObject({ code: "invalid_argument" });
  });
});

describe("block and unblock", () => {
  it("is refused to a plain user", async () => {
    await expect(haulierService.block(C, U, "user", H, "Late twice")).rejects.toMatchObject({ code: "permission_denied" });
    await expect(haulierService.unblock(C, U, "user", H, "Sorted out")).rejects.toMatchObject({ code: "permission_denied" });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("needs a reason of 3 to 500 characters to block", async () => {
    await expect(haulierService.block(C, U, "manager", H, " x ")).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(haulierService.block(C, U, "manager", H, "x".repeat(501))).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(haulierService.unblock(C, U, "manager", H, "  ")).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("blocks with the reason, by whom, and an event; refuses to block twice", async () => {
    repo.find.mockResolvedValue({ profile: record(), lanes: [] });
    repo.save.mockResolvedValue(record({ version: 5 }));
    await haulierService.block(C, U, "admin", H, " Cargo damaged ");
    const [, , version, values, lanes, event] = repo.save.mock.calls[0];
    expect(version).toBe(4);
    expect(lanes).toBeNull();
    expect(values).toMatchObject({ blocked: true, blockReason: "Cargo damaged", blockedBy: "Jana Nováková", insurer: "Kooperativa" });
    expect(event).toMatchObject({ kind: "haulier_blocked", payload: { reason: "Cargo damaged", changes: { blocked: { before: false, after: true } } } });
    repo.find.mockResolvedValue({ profile: record({ blocked: true, blockReason: "x" }), lanes: [] });
    await expect(haulierService.block(C, U, "manager", H, "Again")).rejects.toMatchObject({ code: "failed_precondition" });
  });

  it("unblocks a blocked haulier and clears the block", async () => {
    repo.find.mockResolvedValue({ profile: record({ blocked: true, blockReason: "Cargo damaged", blockedBy: "Petr", blockedAt: new Date() }), lanes: [] });
    repo.save.mockResolvedValue(record({ version: 5 }));
    await haulierService.unblock(C, U, "superadmin", H, "Claim settled");
    const [, , , values, , event] = repo.save.mock.calls[0];
    expect(values).toMatchObject({ blocked: false, blockReason: "", blockedAt: null, blockedBy: null });
    expect(event).toMatchObject({ kind: "haulier_unblocked", payload: { reason: "Claim settled" } });
  });

  it("can block a haulier that has no profile yet (creates it blocked)", async () => {
    repo.save.mockResolvedValue(record({ version: 1, blocked: true }));
    await haulierService.block(C, U, "manager", H2, "Unknown carrier");
    expect(repo.save.mock.calls[0][2]).toBe(0);
  });
});

describe("published bank accounts (Phase 6)", () => {
  it("saves the list normalised, as one change; a save without the list keeps it", async () => {
    repo.find.mockResolvedValue({ profile: record({ bankAccounts: ["19-2000145399/0800"] }), lanes: [] });
    repo.save.mockResolvedValue(record({ version: 5 }));
    await haulierService.update(C, U, H, input({ bankAccounts: ["CZ65 0800 0000 1920 0014 5399", "de89 3704 0044 0532 0130 00"] }), 4);
    const [, , , values, , event] = repo.save.mock.calls[0];
    expect(values.bankAccounts).toEqual(["19-2000145399/0800", "DE89370400440532013000"]);
    expect(Object.keys(event.payload.changes)).toEqual(["bankAccounts"]);

    repo.save.mockClear();
    await haulierService.update(C, U, H, input({ notes: "x" }), 4);
    expect(repo.save.mock.calls[0][3].bankAccounts).toEqual(["19-2000145399/0800"]);
  });

  it("refuses an account that is neither a Czech account nor an IBAN", async () => {
    repo.find.mockResolvedValue({ profile: record(), lanes: [] });
    await expect(haulierService.update(C, U, H, input({ bankAccounts: ["123/45"] }), 4)).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("shows the accounts on the profile", async () => {
    repo.find.mockResolvedValue({ profile: record({ bankAccounts: ["19-2000145399/0800"] }), lanes: [] });
    expect((await haulierService.get(C, H)).profile.bankAccounts).toEqual(["19-2000145399/0800"]);
  });
});
