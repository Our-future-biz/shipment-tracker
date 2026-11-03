import { describe, expect, it } from "vitest";
import { containersOf, floorFor, guardrailSettings, settingsProblem } from "../lib/guardrails";

const ROAD = { percent: 8, minAmountCzk: 300 };

describe("guardrailSettings", () => {
  it("starts from the council's floors and Trucking's for Road (D2, D3)", () => {
    const s = guardrailSettings([], ROAD);
    expect(s.Road).toEqual({ percent: 8, minAmountCzk: 300, perContainer: false });
    expect(s["Sea FCL"]).toEqual({ percent: 7, minAmountCzk: 1500, perContainer: true });
    expect(s.Rail).toEqual({ percent: 7, minAmountCzk: 1500, perContainer: true });
    expect(s["Sea LCL"]).toEqual({ percent: 15, minAmountCzk: 1000, perContainer: false });
    expect(s.Air).toEqual({ percent: 10, minAmountCzk: 1000, perContainer: false });
    expect(s["Sea Break Bulk"]).toEqual({ percent: 10, minAmountCzk: 10000, perContainer: false });
  });

  it("takes what a manager stored over the default, and never stores Road", () => {
    const s = guardrailSettings([{ serviceType: "Air", percent: 12, minAmountCzk: 2000 }, { serviceType: "Road", percent: 1, minAmountCzk: 1 }], ROAD);
    expect(s.Air).toEqual({ percent: 12, minAmountCzk: 2000, perContainer: false });
    expect(s.Road.percent).toBe(8);
  });
});

describe("floorFor", () => {
  it("multiplies the CZK minimum by the containers for Sea FCL and Rail, at least one", () => {
    const s = guardrailSettings([], ROAD);
    expect(containersOf({ containers: [{ qty: 3 }, { qty: 2 }, { qty: 0 }, "x"] })).toBe(5);
    expect(floorFor("Sea FCL", { containers: [{ qty: 3 }, { qty: 2 }] }, s)).toEqual({ percent: 7, minAmountCzk: 7500 });
    expect(floorFor("Rail", {}, s)).toEqual({ percent: 7, minAmountCzk: 1500 });
    expect(floorFor("Air", { containers: [{ qty: 3 }] }, s)).toEqual({ percent: 10, minAmountCzk: 1000 });
  });
});

describe("settingsProblem", () => {
  it("takes the Sales modes with sensible figures, once each", () => {
    expect(settingsProblem([{ serviceType: "Air", percent: 10, minAmountCzk: 1000 }])).toBeNull();
    expect(settingsProblem([{ serviceType: "Road", percent: 8, minAmountCzk: 300 }])).toBe("Road has no guardrail set in Sales (Road's is Trucking's)");
    expect(settingsProblem([{ serviceType: "Air", percent: 120, minAmountCzk: 0 }])).toBe("Air: the percent must be between 0 and 100");
    expect(settingsProblem([{ serviceType: "Air", percent: 10, minAmountCzk: -1 }])).toBe("Air: the minimum in CZK cannot be negative");
    expect(settingsProblem([{ serviceType: "Air", percent: 10, minAmountCzk: 1 }, { serviceType: "Air", percent: 10, minAmountCzk: 1 }])).toBe("Each freight mode once");
  });
});
