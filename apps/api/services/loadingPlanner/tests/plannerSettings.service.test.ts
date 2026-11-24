import { beforeEach, describe, expect, it, vi } from "vitest";

// Loading Planner → Settings, run for real with its rules against a stand-in for the repository.
const repository = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("../repositories/plannerSetting.repository", () => ({ plannerSettingRepository: repository }));

import type { PlannerSettings } from "../interfaces/interfaces";
import { DEFAULT_SETTINGS } from "../lib/clearance";
import type { PlannerSettingRecord } from "../schemas/plannerSetting.schema";
import { plannerSettingsService, settingsOfRow } from "../services/plannerSettings.service";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const actor = (role: string) => ({ userID: USER, companyID: COMPANY, role });

const row: PlannerSettingRecord = {
  companyId: COMPANY,
  doorWidthMm: 30,
  doorHeightMm: 40,
  lengthMm: 150,
  oogWidthMm: 3600,
  oogOverEndMm: 800,
  oogHeightMm: 3100,
  heavyWarnKg: 6000,
  heavyMoveKg: 12000,
  updatedByUserId: USER,
  updatedAt: new Date("2026-11-23T09:00:00.000Z"),
};
const fromRow: PlannerSettings = {
  clearance: { doorWidthMm: 30, doorHeightMm: 40, lengthMm: 150 },
  oogWarning: { widthMm: 3600, overEndMm: 800, heightMm: 3100 },
  heavyPiece: { warnKg: 6000, moveKg: 12000 },
};

beforeEach(() => {
  vi.clearAllMocks();
  repository.save.mockResolvedValue(row);
});

describe("settingsOfRow", () => {
  it("reads each figure from its own column", () => {
    expect(settingsOfRow(row)).toEqual(fromRow);
  });
});

describe("get", () => {
  it("gives the starting figures while nobody has set any, and says so", async () => {
    repository.get.mockResolvedValue(null);
    await expect(plannerSettingsService.get(COMPANY, "user")).resolves.toEqual({ settings: DEFAULT_SETTINGS, changed: false, canEdit: false });
    expect(repository.get).toHaveBeenCalledWith(COMPANY);
  });

  it("gives the company's own figures, and lets a manager change them", async () => {
    repository.get.mockResolvedValue(row);
    await expect(plannerSettingsService.get(COMPANY, "manager")).resolves.toEqual({ settings: fromRow, changed: true, canEdit: true });
  });
});

describe("set", () => {
  it("refuses a plain user, and stores nothing", async () => {
    await expect(plannerSettingsService.set(actor("user"), fromRow)).rejects.toMatchObject({
      code: "permission_denied",
      message: "Only managers and admins change the Loading Planner's settings",
    });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("refuses a figure out of its range, naming it, and stores nothing", async () => {
    const settings = { ...fromRow, clearance: { ...fromRow.clearance, lengthMm: 501 } };
    await expect(plannerSettingsService.set(actor("admin"), settings)).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringContaining("clearance on length") });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("stores a manager's figures for the company and answers with what was stored", async () => {
    await expect(plannerSettingsService.set(actor("manager"), fromRow)).resolves.toEqual({ settings: fromRow, changed: true, canEdit: true });
    expect(repository.save).toHaveBeenCalledWith(COMPANY, fromRow, USER);
  });
});
