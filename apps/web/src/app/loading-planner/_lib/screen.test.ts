import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { cargoLinesOf, completeLine, isBlank, lineLabel, newDraftLine, saveProblem, type DraftLine } from "./cargoForm";
import { jobHref, linesFromQuote, linesFromShipment, quotePackages } from "./jobCargo";
import { lineColour, loadStats, planTotals } from "./loadStats";
import { planLoad } from "./plan";
import { cameraFor, sceneBalance, sceneBounds, sceneBoxes, sceneFloor } from "./scene";
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

describe("3D scene", () => {
  const plan = planLoad(cargoLinesOf([draft({ lengthMm: 5000, widthMm: 3000, heightMm: 2000, weightKg: 15000, colli: 1 }), draft({ id: "p", colli: 4, stackable: true })]));
  const rack = plan.loads.find((l) => l.container.group === "flat-rack")!;

  it("draws every piece in metres, length along X and height up", () => {
    const boxes = sceneBoxes(rack);
    expect(boxes).toHaveLength(rack.pieces.length);
    const machine = boxes.find((b) => b.piece.weightKg === 15000)!;
    expect(machine.size).toEqual([5, 2, 3]);
    expect(machine.centre[1]).toBe(1);
    expect(machine.centre[2]).toBeCloseTo(sceneFloor(rack).width / 2, 3);
  });

  it("covers the overhang and puts the cameras around it", () => {
    const { min, max } = sceneBounds(rack);
    expect(min[2]).toBeLessThan(0);
    expect(max[2]).toBeGreaterThan(sceneFloor(rack).width);
    const top = cameraFor("top", rack);
    expect(top.position[1]).toBeGreaterThan(max[1]);
    expect(cameraFor("side", rack).position[2]).toBeGreaterThan(max[2]);
    expect(cameraFor("front", rack).position[0]).toBeLessThan(min[0]);
  });

  it("marks the centre of gravity and its tolerance", () => {
    const balance = sceneBalance(rack, 10);
    expect(balance.ok).toBe(true);
    expect(balance.tolerance[0]).toBeCloseTo(sceneFloor(rack).length / 20, 6);
    expect(Math.abs(balance.cog[0] - sceneFloor(rack).length / 2)).toBeLessThanOrEqual(balance.tolerance[0]);
  });
});

describe("cargo of a job", () => {
  let n = 0;
  const newId = () => `id-${++n}`;
  const row = (more: Partial<interfaces.CargoDimensionLine> = {}): interfaces.CargoDimensionLine => ({
    pieces: "4",
    lengthCm: "120",
    widthCm: "80",
    heightCm: "100.5",
    weightPerPcKg: "400",
    packageType: "Pallet",
    stackable: "Stackable / Overstowable",
    ...more,
  });

  it("reads a shipment's Dimensions rows: cm to mm, weight per piece, the stackable wording", () => {
    const lines = linesFromShipment([row(), row({ packageType: "Crate", stackable: "Not stackable / Not overstowable", pieces: "1", weightPerPcKg: "1,5" })], newId);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ name: "Pallet", lengthMm: 1200, widthMm: 800, heightMm: 1005, weightKg: 400, colli: 4, stackable: true, canTurn: true });
    expect(lines[1]).toMatchObject({ name: "Crate", stackable: false, colli: 1, weightKg: 1.5 });
    expect(completeLine(lines[0]!)).not.toBeNull();
  });

  it("keeps a half-filled row for the user to finish and drops an empty one", () => {
    const lines = linesFromShipment([row({ heightCm: "", pieces: "" }), row({ lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "" })], newId);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ heightMm: null, colli: null });
    expect(completeLine(lines[0]!)).toBeNull();
    expect(linesFromShipment(null, newId)).toEqual([]);
  });

  it("numbers the lines that share a package type", () => {
    expect(linesFromShipment([row(), row(), row({ packageType: "" })], newId).map((l) => l.name)).toEqual(["Pallet 1", "Pallet 2", "Cargo"]);
  });

  it("reads a quote's package lines out of its document", () => {
    const data = { customerName: "ACME", packages: [{ qty: 2, type: "Case", length: 250, width: 120, height: 180, weight: 950, stackable: false }, { qty: 0, type: "" }] };
    const lines = linesFromQuote(quotePackages(data), newId);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ name: "Case", lengthMm: 2500, widthMm: 1200, heightMm: 1800, weightKg: 950, colli: 2, stackable: false });
    expect(quotePackages({})).toEqual([]);
    expect(quotePackages(null)).toEqual([]);
  });

  it("knows where a job opens", () => {
    expect(jobHref("shipment", "abc", "CZ00000053")).toBe("/shipments/abc");
    expect(jobHref("quote", "abc", "QCZ 12/3")).toBe("/sales/quote/QCZ%2012%2F3");
  });
});
