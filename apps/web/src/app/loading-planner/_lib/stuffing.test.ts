import { describe, expect, it } from "vitest";
import { CONTAINERS } from "./containers";
import type { ContainerLoad, PlacedPiece } from "./plan";
import { planLoad } from "./plan";
import { floorStepNumbers, howText, loadingRuns, loadingSteps, stepsText, whereText } from "./stuffing";

const HC = CONTAINERS.find((c) => c.id === "40hc")!;
const piece = (lineId: string, z: number, x: number, y = 0, more: Partial<PlacedPiece> = {}): PlacedPiece => ({ lineId, name: lineId, x, y, z, length: 1200, width: 800, height: 1000, weightKg: 500, crosswise: false, ...more });
const load = (pieces: PlacedPiece[]): ContainerLoad => ({ container: HC, pieces, totalWeightKg: pieces.reduce((t, p) => t + p.weightKg, 0) });
const mm = (v: number) => `${v} mm`;

describe("the loading order of a container (Council Outlay 14, P1)", () => {
  it("goes from the front wall to the doors, left to right, a stacked piece right after the one under it", () => {
    const steps = loadingSteps(load([piece("b", 1200, 0), piece("a", 0, 800), piece("a", 0, 0, 1000), piece("a", 0, 0)]));
    expect(steps.map((s) => [s.no, s.piece.z, s.piece.x, s.piece.y, s.onStep])).toEqual([
      [1, 0, 0, 0, null],
      [2, 0, 0, 1000, 1],
      [3, 0, 800, 0, null],
      [4, 1200, 0, 0, null],
    ]);
  });

  it("gives every piece one step, and none twice", () => {
    const plan = planLoad([{ id: "p", name: "Pallet", lengthMm: 1200, widthMm: 800, heightMm: 1100, weightKg: 400, colli: 23, canTurn: true, stackable: true }]);
    const all = plan.loads.flatMap((l) => loadingSteps(l));
    expect(all.length).toBe(23);
    for (const l of plan.loads) expect(loadingSteps(l).map((s) => s.no)).toEqual(l.pieces.map((_, i) => i + 1));
    // Every stacked piece stands on a step before its own.
    for (const s of all) if (s.piece.y > 0) expect(s.onStep).not.toBeNull();
    for (const s of all) if (s.onStep !== null) expect(s.onStep).toBeLessThan(s.no);
  });

  it("puts places that repeat on one row, so forty pallets do not fill pages", () => {
    const pieces = [0, 1200, 2400].flatMap((z) => [piece("pal", z, 0), piece("pal", z, 800, 0, { crosswise: true })]);
    const runs = loadingRuns(load([...pieces, piece("crate", 3600, 0, 0, { length: 2000 }), piece("pal", 5600, 0)]));
    expect(runs.map((r) => [stepsText(r), r.lineId, r.count, r.places, r.fromMm, r.toMm])).toEqual([
      ["1-6", "pal", 6, 6, 0, 3600],
      ["7", "crate", 1, 1, 3600, 5600],
      ["8", "pal", 1, 1, 5600, 6800],
    ]);
    expect(howText(runs[0]!)).toBe("6 places, 3 of them crosswise");
    expect(whereText(runs[0]!, "front wall", mm)).toBe("0 mm to 3600 mm from the front wall");
  });

  it("keeps a place and what stands on it together, and starts a new row where the height changes", () => {
    const runs = loadingRuns(load([piece("a", 0, 0), piece("a", 0, 0, 1000), piece("a", 0, 800), piece("a", 0, 800, 1000), piece("a", 1200, 0)]));
    expect(runs.map((r) => [stepsText(r), r.count, r.places, r.high])).toEqual([
      ["1-4", 4, 2, 2],
      ["5", 1, 1, 1],
    ]);
    expect(howText(runs[0]!)).toBe("2 places, 2 high (the lower piece first)");
    expect(howText(runs[1]!)).toBe("1 place");
  });

  it("counts every piece of the load once", () => {
    const plan = planLoad([{ id: "p", name: "Pallet", lengthMm: 1200, widthMm: 800, heightMm: 1100, weightKg: 400, colli: 40, canTurn: true, stackable: true }]);
    for (const l of plan.loads) {
      const runs = loadingRuns(l);
      expect(runs.reduce((n, r) => n + r.count, 0)).toBe(l.pieces.length);
      expect(runs[runs.length - 1]!.toStep).toBe(l.pieces.length);
    }
  });

  it("numbers the pieces on the floor for the drawing", () => {
    const numbers = floorStepNumbers(load([piece("a", 0, 0), piece("a", 0, 0, 1000), piece("b", 1200, 0)]));
    expect([...numbers.entries()]).toEqual([["0|0", 1], ["0|1200", 3]]);
  });
});

describe("gross weight and the road-weight warning (Council Outlay 14, P2)", () => {
  const pallets = (colli: number, weightKg: number) => [{ id: "p", name: "Pallet", lengthMm: 1200, widthMm: 800, heightMm: 1100, weightKg, colli, canTurn: true, stackable: false }];

  it("adds the empty container's weight to the cargo", async () => {
    const { loadStats } = await import("./loadStats");
    const [first] = planLoad(pallets(12, 450)).loads;
    const stats = loadStats(first!);
    expect(stats.tareKg).toBe(first!.container.tareKg);
    expect(stats.grossKg).toBe(5400 + first!.container.tareKg);
  });

  it("gives every container type a tare", () => {
    for (const c of CONTAINERS) expect(c.tareKg, c.name).toBeGreaterThan(2000);
  });

  it("warns when a container with its cargo weighs more than the weight set for the road, by its length", async () => {
    const { ruleWarnings } = await import("./loadStats");
    const { DEFAULT_RULES } = await import("./containers");
    const rules = { ...DEFAULT_RULES, roadWeight: { gross20Kg: 20000, gross40Kg: null } };
    // 20 pallets of 1,000 kg go into one 20' DC: 20,000 kg of cargo and 2,250 kg of container.
    const [load] = planLoad(pallets(11, 1700), ["20dc"], rules).loads;
    const gross = 11 * 1700 + 2250;
    expect(ruleWarnings(load!, "mm").some((w) => w.startsWith(`About ${gross.toLocaleString("en-US")} kg gross`) && w.includes("over the 20,000 kg set for the road"))).toBe(true);
    // No weight is set for a 40': no warning there, and none without the setting.
    expect(planLoad(pallets(11, 1700), ["40dc"], rules).loads.flatMap((l) => ruleWarnings(l, "mm")).some((w) => w.includes("set for the road"))).toBe(false);
    expect(planLoad(pallets(11, 1700), ["20dc"], DEFAULT_RULES).loads.flatMap((l) => ruleWarnings(l, "mm")).some((w) => w.includes("set for the road"))).toBe(false);
  });
});
