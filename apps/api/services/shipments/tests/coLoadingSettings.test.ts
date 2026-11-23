import { describe, expect, it } from "vitest";
import { DEFAULT_PLANNING_VOLUME_PCT, inlandWeightProblem, planningPctProblem } from "../lib/coLoadingSettings";

describe("Co-Loading settings", () => {
  it("start at 85 percent of a box's inside volume", () => {
    expect(DEFAULT_PLANNING_VOLUME_PCT).toBe(85);
  });

  it("take a planning share of 50 to 100 whole percent", () => {
    expect([50, 85, 100].map(planningPctProblem)).toEqual([null, null, null]);
    for (const wrong of [49, 101, 85.5, Number.NaN]) expect(planningPctProblem(wrong), String(wrong)).toContain("50 to 100 percent");
  });

  it("take an inland weight of 1,000 to 50,000 whole kg, or none", () => {
    expect([null, 1000, 24000, 50000].map(inlandWeightProblem)).toEqual([null, null, null, null]);
    for (const wrong of [0, 999, 50001, 24000.5, Number.NaN]) expect(inlandWeightProblem(wrong), String(wrong)).toContain("1,000 to 50,000");
  });
});
