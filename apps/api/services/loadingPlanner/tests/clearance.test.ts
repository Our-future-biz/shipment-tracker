import { describe, expect, it } from "vitest";
import { canEditPlannerSettings, clearanceProblem, DEFAULT_CLEARANCE } from "../lib/clearance";

describe("clearanceProblem", () => {
  it("takes whole millimetres from 0 to 500", () => {
    expect(clearanceProblem(DEFAULT_CLEARANCE)).toBeNull();
    expect(clearanceProblem({ doorWidthMm: 0, doorHeightMm: 0, lengthMm: 500 })).toBeNull();
  });

  it("names the figure that cannot be saved", () => {
    expect(clearanceProblem({ doorWidthMm: -1, doorHeightMm: 50, lengthMm: 100 })).toContain("door width");
    expect(clearanceProblem({ doorWidthMm: 50, doorHeightMm: 12.5, lengthMm: 100 })).toContain("door height");
    expect(clearanceProblem({ doorWidthMm: 50, doorHeightMm: 50, lengthMm: 501 })).toContain("length");
    expect(clearanceProblem({ doorWidthMm: 50, doorHeightMm: 50, lengthMm: Number.NaN })).toContain("length");
  });
});

describe("canEditPlannerSettings", () => {
  it("lets managers and admins set the figures, not plain users", () => {
    expect(["superadmin", "admin", "manager", "user", ""].map(canEditPlannerSettings)).toEqual([true, true, true, false, false]);
  });
});
