import { describe, expect, it } from "vitest";
import type { PlannerSettings } from "../interfaces/interfaces";
import { canEditPlannerSettings, DEFAULT_SETTINGS, settingsProblem } from "../lib/clearance";

const withSettings = (change: (s: PlannerSettings) => void): PlannerSettings => {
  const settings = structuredClone(DEFAULT_SETTINGS);
  change(settings);
  return settings;
};

describe("settingsProblem", () => {
  it("takes the starting figures and the ends of each range", () => {
    expect(settingsProblem(DEFAULT_SETTINGS)).toBeNull();
    expect(settingsProblem(withSettings((s) => (s.clearance = { doorWidthMm: 0, doorHeightMm: 0, lengthMm: 500 })))).toBeNull();
    expect(settingsProblem(withSettings((s) => (s.heavyPiece = { warnKg: 8000, moveKg: 8000 })))).toBeNull();
  });

  it("names the figure that cannot be saved", () => {
    expect(settingsProblem(withSettings((s) => (s.clearance.doorWidthMm = -1)))).toContain("clearance on door width");
    expect(settingsProblem(withSettings((s) => (s.clearance.doorHeightMm = 12.5)))).toContain("clearance on door height");
    expect(settingsProblem(withSettings((s) => (s.clearance.lengthMm = 501)))).toContain("clearance on length");
    expect(settingsProblem(withSettings((s) => (s.oogWarning.widthMm = 2000)))).toContain("out-of-gauge width");
    expect(settingsProblem(withSettings((s) => (s.oogWarning.overEndMm = Number.NaN)))).toContain("overhang per end");
    expect(settingsProblem(withSettings((s) => (s.oogWarning.heightMm = 20000)))).toContain("cargo height");
    expect(settingsProblem(withSettings((s) => (s.heavyPiece.warnKg = 0)))).toContain("warned about");
  });

  it("does not let a piece leave standard containers before it is warned about", () => {
    expect(settingsProblem(withSettings((s) => (s.heavyPiece = { warnKg: 8000, moveKg: 6000 })))).toContain("cannot be below");
  });
});

describe("canEditPlannerSettings", () => {
  it("lets managers and admins set the figures, not plain users", () => {
    expect(["superadmin", "admin", "manager", "user", ""].map(canEditPlannerSettings)).toEqual([true, true, true, false, false]);
  });
});
