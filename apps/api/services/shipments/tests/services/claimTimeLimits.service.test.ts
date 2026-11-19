import { beforeEach, describe, expect, it, vi } from "vitest";

// The company's claim time limits: off by default with the general practice shown; switched on
// only with all four modes' numbers, stamping who confirmed them.
const repo = vi.hoisted(() => ({ of: vi.fn(), save: vi.fn() }));
const lookup = vi.hoisted(() => ({ userEmailOf: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../repositories/claimTimeLimits.repository", () => ({ claimTimeLimitsRepository: repo }));
vi.mock("../../../../lib/companyUsers", () => lookup);

import { GENERAL_PRACTICE } from "../../lib/claimTimeLimits";
import { claimTimeLimitsService } from "../../services/claimTimeLimits.service";

const MANAGER = { userID: "u1", companyID: "c1", role: "manager" };
const ALL = { sea: { noticeDays: 3, suitMonths: 12 }, air: { noticeDays: 14, suitMonths: 24 }, rail: { noticeDays: 7, suitMonths: 12 }, road: { noticeDays: 7, suitMonths: 12 } };
const saved = () => repo.save.mock.calls.at(-1)![1];

beforeEach(() => {
  vi.clearAllMocks();
  repo.of.mockResolvedValue(null);
  repo.save.mockImplementation(async (companyId: string, values: object) => ({ id: "r1", companyId, createdAt: new Date(), updatedAt: new Date("2026-11-18T10:00:00Z"), deletedAt: null, ...values }));
  lookup.userEmailOf.mockResolvedValue("eva@firma.cz");
});

describe("the claim time limits", () => {
  it("are off with the general practice while never saved, and off for the rules", async () => {
    await expect(claimTimeLimitsService.settings("c1")).resolves.toEqual({
      enabled: false,
      limits: GENERAL_PRACTICE,
      generalPractice: GENERAL_PRACTICE,
      saved: false,
      confirmedBy: "",
      confirmedAt: null,
      updatedBy: "",
      updatedAt: null,
    });
    await expect(claimTimeLimitsService.of("c1")).resolves.toMatchObject({ enabled: false });
  });

  it("switched on need the four modes' numbers, and stamp who confirmed them", async () => {
    await expect(claimTimeLimitsService.save(MANAGER, { enabled: true, sea: ALL.sea })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repo.save).not.toHaveBeenCalled();
    const on = await claimTimeLimitsService.save(MANAGER, { enabled: true, ...ALL, rail: { noticeDays: 5, suitMonths: 9 } });
    expect(saved()).toMatchObject({ enabled: true, railNoticeDays: 5, railSuitMonths: 9, confirmedByUserId: "u1", confirmedBy: "eva@firma.cz", confirmedAt: expect.any(Date), updatedBy: "eva@firma.cz" });
    expect(on).toMatchObject({ enabled: true, saved: true, confirmedBy: "eva@firma.cz", limits: { rail: { noticeDays: 5, suitMonths: 9 } } });
  });

  it("switched off clear the confirmation and keep what a mode not sent had", async () => {
    await claimTimeLimitsService.save(MANAGER, { enabled: false, air: { noticeDays: 21, suitMonths: 24 } });
    expect(saved()).toMatchObject({ enabled: false, airNoticeDays: 21, seaNoticeDays: 3, confirmedByUserId: null, confirmedBy: "", confirmedAt: null });
  });

  it("are not saved when who saves them can't be read", async () => {
    lookup.userEmailOf.mockRejectedValue(new Error("down"));
    await expect(claimTimeLimitsService.save(MANAGER, { enabled: true, ...ALL })).rejects.toThrow();
    expect(repo.save).not.toHaveBeenCalled();
  });
});
