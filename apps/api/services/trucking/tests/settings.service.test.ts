import { beforeEach, describe, expect, it, vi } from "vitest";

// The service runs for real against a stand-in repository (no database under vitest).
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
const repo = vi.hoisted(() => ({ find: vi.fn(), save: vi.fn() }));
vi.mock("../repositories/settings.repository", () => ({ settingsRepository: repo }));
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "Jana Nováková") }));

import { settingsService } from "../services/settings.service";
import { DEFAULT_SETTINGS } from "../lib/settingsRules";
import type { TruckingSettingsInput } from "../interfaces/interfaces";

const C = "00000000-0000-0000-0000-000000000001";
const U = "00000000-0000-0000-0000-000000000002";
const clone = (): TruckingSettingsInput => JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
const row = (version: number, values = clone()) => ({ ...values, id: "r", companyId: C, version, updatedBy: "Petr", updatedAt: new Date("2026-10-01T08:00:00Z") });

beforeEach(() => {
  vi.resetAllMocks();
  repo.find.mockResolvedValue(null);
});

describe("trucking settings", () => {
  it("gives the defaults at version 0 before anything is saved", async () => {
    expect(await settingsService.get(C)).toEqual({ ...DEFAULT_SETTINGS, version: 0, updatedAt: null, updatedBy: null });
  });

  it("lets only a manager, admin or superadmin save", async () => {
    await expect(settingsService.update(C, U, "user", clone(), 0)).rejects.toMatchObject({ code: "permission_denied" });
    expect(repo.save).not.toHaveBeenCalled();
    const next = clone();
    next.marginFloor.percent = 10;
    for (const role of ["manager", "admin", "superadmin"]) {
      repo.save.mockResolvedValueOnce(row(1, next));
      expect((await settingsService.update(C, U, role, next, 0)).marginFloor.percent).toBe(10);
    }
  });

  it("saves with the version read and writes one event with before and after", async () => {
    const next = clone();
    next.factors.kgPerLdm = 1850;
    repo.save.mockResolvedValue(row(1, next));
    const s = await settingsService.update(C, U, "manager", next, 0);
    expect(s).toMatchObject({ version: 1, updatedBy: "Petr", updatedAt: "2026-10-01T08:00:00.000Z" });
    expect(repo.save).toHaveBeenCalledWith(C, 0, next, "Jana Nováková", {
      kind: "settings_updated",
      customerId: null,
      byUserId: U,
      byName: "Jana Nováková",
      payload: { changes: { factors: { before: DEFAULT_SETTINGS.factors, after: next.factors } } },
    });
  });

  it("refuses a stale version with 409 and the plain message", async () => {
    repo.find.mockResolvedValue(row(3));
    const next = clone();
    next.factors.kgPerCbm = 300;
    await expect(settingsService.update(C, U, "manager", next, 2)).rejects.toMatchObject({
      code: "aborted",
      message: "Settings were changed by someone else. Reload and try again.",
    });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("refuses when the conditional write finds no row at the version (a save in between)", async () => {
    repo.find.mockResolvedValue(row(3));
    repo.save.mockResolvedValue(null);
    const next = clone();
    next.factors.kgPerCbm = 300;
    await expect(settingsService.update(C, U, "admin", next, 3)).rejects.toMatchObject({ code: "aborted" });
    expect(repo.save).toHaveBeenCalledWith(C, 3, expect.anything(), expect.anything(), expect.anything());
  });

  it("refuses invalid settings before reading or writing anything", async () => {
    const next = clone();
    next.serviceLevels[2].cutoff = "25:00";
    await expect(settingsService.update(C, U, "manager", next, 0)).rejects.toMatchObject({ code: "invalid_argument", message: "Service level D3: the cut-off must be a time like 12:00" });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("does not save (nor bump the version) when nothing changed", async () => {
    repo.find.mockResolvedValue(row(2));
    expect((await settingsService.update(C, U, "manager", clone(), 2)).version).toBe(2);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
