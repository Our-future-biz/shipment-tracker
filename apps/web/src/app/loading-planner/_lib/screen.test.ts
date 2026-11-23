import { describe, expect, it } from "vitest";
import { cargoLinesOf, completeLine, isBlank, lineLabel, newDraftLine, saveProblem, type DraftLine } from "./cargoForm";
import { lineColour, loadStats, planTotals } from "./loadStats";
import { planLoad } from "./plan";
import { formatDim, formatKg, formatSize, fromMm, toMm } from "./units";

const draft = (more: Partial<DraftLine> = {}): DraftLine => ({ ...newDraftLine("a"), name: "Pallet", lengthMm: 1200, widthMm: 800, heightMm: 1000, weightKg: 400, colli: 4, ...more });

describe("units", () => {
  it("keeps sizes in whole millimetres whatever unit is typed", () => {
    expect(toMm(120.5, "cm")).toBe(1205);
    expect(toMm(1.2345, "m")).toBe(1235);
    expect(toMm(2352, "mm")).toBe(2352);
    expect(fromMm(1205, "cm")).toBe(120.5);
  });

  it("writes sizes and weights", () => {
    expect(formatDim(12032, "mm")).toBe("12,032");
    expect(formatDim(12032, "m")).toBe("12.032");
    expect(formatSize(1200, 800, 1000, "cm")).toBe("120 × 80 × 100 cm");
    expect(formatKg(12500.25)).toBe("12,500.3 kg");
  });
});

describe("cargo form", () => {
  it("plans only the complete lines", () => {
    expect(completeLine(draft())).toMatchObject({ id: "a", name: "Pallet", colli: 4 });
    expect(completeLine(draft({ weightKg: null }))).toBeNull();
    expect(completeLine(draft({ colli: 0 }))).toBeNull();
    expect(cargoLinesOf([draft(), draft({ id: "b", heightMm: null }), newDraftLine("c")])).toHaveLength(1);
  });

  it("tells a blank line from an unfinished one", () => {
    expect(isBlank(newDraftLine("c"))).toBe(true);
    expect(isBlank(draft({ lengthMm: null }))).toBe(false);
    expect(lineLabel({ name: " " }, 2)).toBe("Line 3");
  });

  it("says why a plan cannot be saved", () => {
    expect(saveProblem(" ", [draft()])).toBe("Give the plan a name before saving.");
    expect(saveProblem("Plan", [draft(), newDraftLine("c")])).toBeNull();
    expect(saveProblem("Plan", [])).toBeNull();
    expect(saveProblem("Plan", [draft(), draft({ id: "b", name: "", widthMm: null })])).toBe('"Line 2" is not complete: fill in its length, width, height, weight and colli.');
  });
});

describe("load figures", () => {
  it("adds up a load", () => {
    const plan = planLoad(cargoLinesOf([draft({ colli: 22, stackable: true })]));
    const [load] = plan.loads;
    expect(load?.container.name).toBe("20' DC");
    const stats = loadStats(load!);
    expect(stats.pieceCount).toBe(22);
    expect(stats.payloadPct).toBeCloseTo((8800 / 28230) * 100, 5);
    expect(stats.floorPct).toBeCloseTo(((11 * 1200 * 800) / (5898 * 2352)) * 100, 5);
    expect(stats.groups.reduce((n, g) => n + g.count, 0)).toBe(22);
    expect(stats.groups.reduce((n, g) => n + g.stacked, 0)).toBe(11);
    expect(stats.outOfGauge).toBe(false);
    expect(stats.balance.ok).toBe(true);
  });

  it("shows the overhang of a load and counts only the floor it covers", () => {
    const plan = planLoad(cargoLinesOf([draft({ lengthMm: 5000, widthMm: 3000, heightMm: 2000, weightKg: 15000, colli: 1 })]));
    const stats = loadStats(plan.loads[0]!);
    expect(stats.outOfGauge).toBe(true);
    expect(stats.groups[0]?.over).toEqual({ length: 0, width: 790, height: 0 });
    expect(stats.floorPct).toBeCloseTo((5000 / 5612) * 100, 5);
  });

  it("sums a plan", () => {
    const plan = planLoad(cargoLinesOf([draft({ colli: 40 }), draft({ id: "t", name: "Transformer", weightKg: 40000, colli: 2 })]));
    expect(planTotals(plan)).toEqual({ equipment: [{ name: "40' DC", count: 2 }], pieces: 40, weightKg: 16000, notLoaded: 2, balanced: 2 });
  });

  it("gives every line a colour, repeating", () => {
    expect(lineColour(0).fill).toBe("fill-indigo-400");
    expect(lineColour(12)).toBe(lineColour(0));
  });
});
