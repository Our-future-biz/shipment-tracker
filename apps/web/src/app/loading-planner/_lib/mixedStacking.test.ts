import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "./containers";
import type { CargoLine } from "./gauge";
import { loadingSteps } from "./stuffing";
import { planLoad, type ContainerLoad } from "./plan";

const line = (id: string, l: number, w: number, h: number, kg: number, colli: number, more: Partial<CargoLine> = {}): CargoLine => ({ id, name: id, lengthMm: l, widthMm: w, heightMm: h, weightKg: kg, colli, canTurn: true, stackable: false, ...more });
const of = (load: ContainerLoad, id: string) => load.pieces.filter((p) => p.lineId === id);
const total = (plan: { loads: ContainerLoad[] }, id: string) => plan.loads.reduce((n, load) => n + of(load, id).length, 0);

describe("mixed stacking with a top-load limit (Council Outlay 14, P9)", () => {
  // Eight crates of 1,400 × 1,150 fill the floor of a 20' DC (two across, four rows): anything more goes on top, or into another container.
  const crates = (more: Partial<CargoLine> = {}) => line("crate", 1400, 1150, 1000, 600, 8, more);
  const cartons = line("carton", 1000, 800, 800, 150, 8);

  it("changes nothing for cargo without a top-load limit", () => {
    const cargo = [crates(), cartons];
    const plan = planLoad(cargo, ["20dc"], DEFAULT_RULES);
    expect(plan.loads.every((load) => load.pieces.every((p) => p.y === 0))).toBe(true);
    expect(planLoad(cargo.map((c) => ({ ...c, topLoadKg: undefined })), ["20dc"], DEFAULT_RULES)).toEqual(plan);
  });

  it("stands lighter cargo of another line on a piece that carries it, and needs fewer containers for it", () => {
    const without = planLoad([crates(), cartons], ["20dc"], DEFAULT_RULES);
    const withLimit = planLoad([crates({ topLoadKg: 300 }), cartons], ["20dc"], DEFAULT_RULES);
    expect(withLimit.notLoaded).toEqual([]);
    expect(total(withLimit, "carton")).toBe(8);
    expect(withLimit.loads.length).toBeLessThan(without.loads.length);
    const stacked = withLimit.loads.flatMap((load) => of(load, "carton").filter((p) => p.y > 0).map((p) => ({ load, p })));
    expect(stacked.length).toBeGreaterThan(0);
    for (const { load, p } of stacked) {
      // Each stands on a crate's own corner, at the crate's height, and rests on it whole.
      const base = load.pieces.find((b) => b.y === 0 && b.x === p.x && b.z === p.z)!;
      expect(base.lineId).toBe("crate");
      expect(p.y).toBe(1000);
      expect(p.length).toBeLessThanOrEqual(base.length);
      expect(p.width).toBeLessThanOrEqual(base.width);
    }
  });

  it("never puts more on a piece than its limit, nor anything that reaches over its edge", () => {
    // 150 kg cartons on a crate that carries 200 kg: one each, never two.
    const light = planLoad([crates({ topLoadKg: 200 }), line("carton", 1000, 800, 300, 150, 8)], ["20dc"], DEFAULT_RULES);
    for (const load of light.loads) {
      for (const base of of(load, "crate")) expect(load.pieces.filter((p) => p.y > 0 && p.x === base.x && p.z === base.z).length).toBeLessThanOrEqual(1);
    }
    // A piece longer than the crate is not stood on it.
    const long = planLoad([crates({ topLoadKg: 5000 }), line("beam", 2000, 500, 300, 100, 4)], ["20dc"], DEFAULT_RULES);
    expect(long.loads.flatMap((load) => of(load, "beam")).every((p) => p.y === 0)).toBe(true);
    // Too heavy for the limit: on the floor.
    const heavy = planLoad([crates({ topLoadKg: 100 }), cartons], ["20dc"], DEFAULT_RULES);
    expect(heavy.loads.flatMap((load) => of(load, "carton")).every((p) => p.y === 0)).toBe(true);
  });

  it("lets a column grow only as far as every piece under the top bears, and stays under the roof", () => {
    // Cartons that carry 150 kg themselves: two on a crate that bears 300 kg, the upper on the lower.
    const plan = planLoad([crates({ topLoadKg: 300 }), line("carton", 1000, 800, 500, 150, 16, { topLoadKg: 150 })], ["20dc"], DEFAULT_RULES);
    expect(plan.notLoaded).toEqual([]);
    expect(plan.loads).toHaveLength(1);
    const [load] = plan.loads;
    expect(of(load!, "carton").map((p) => p.y).sort((a, b) => a - b)).toEqual([...Array(8).fill(1000), ...Array(8).fill(1500)]);
    // A third carton would be 450 kg on a crate that bears 300: it opens another container instead.
    expect(planLoad([crates({ topLoadKg: 300 }), line("carton", 1000, 800, 300, 150, 17, { topLoadKg: 150 })], ["20dc"], DEFAULT_RULES).loads).toHaveLength(2);
    // 1,000 + 3 × 800 mm would pass the 2,385 mm roof of a 20' DC: no third level.
    const tall = planLoad([crates({ colli: 4, topLoadKg: 5000 }), line("carton", 1000, 800, 800, 50, 12, { topLoadKg: 5000 })], ["20dc"], DEFAULT_RULES);
    expect(Math.max(...tall.loads[0]!.pieces.map((p) => p.y + p.height))).toBeLessThanOrEqual(tall.loads[0]!.container.internalH);
  });

  it("still stacks a line with a limit on its own kind, by the limit", () => {
    const plan = planLoad([line("drum", 1200, 1000, 900, 400, 16, { topLoadKg: 400 })], ["20dc"], DEFAULT_RULES);
    expect(plan.loads).toHaveLength(1);
    expect(of(plan.loads[0]!, "drum").filter((p) => p.y > 0).length).toBeGreaterThan(0);
  });

  it("keeps a piece on its base through the centring, and loads it right after its base", () => {
    const plan = planLoad([crates({ colli: 3, topLoadKg: 300 }), line("carton", 1000, 800, 800, 150, 3), line("heavy", 1200, 1000, 1000, 3000, 1)], ["20dc"], DEFAULT_RULES);
    for (const load of plan.loads) {
      for (const p of load.pieces.filter((q) => q.y > 0)) expect(load.pieces.some((b) => b.y === 0 && b.x === p.x && b.z === p.z && b.height === p.y)).toBe(true);
      const steps = loadingSteps(load);
      for (const [index, step] of steps.entries()) {
        if (step.piece.y > 0) expect(steps[index - 1]!.piece.x === step.piece.x && steps[index - 1]!.piece.z === step.piece.z).toBe(true);
      }
    }
  });
});

describe("the top-load limit on the screen and in what is saved", () => {
  it("is kept with the line, and a change of it is something to save", async () => {
    const { completeLine, newDraftLine, planFingerprint } = await import("./cargoForm");
    const draft = { ...newDraftLine("a"), name: "Crate", lengthMm: 1400, widthMm: 1150, heightMm: 1000, weightKg: 600 };
    expect(completeLine({ ...draft, topLoadKg: 300 })).toMatchObject({ topLoadKg: 300 });
    expect(completeLine(draft)).not.toHaveProperty("topLoadKg");
    expect(planFingerprint("P", [draft], null, null)).not.toBe(planFingerprint("P", [{ ...draft, topLoadKg: 300 }], null, null));
  });
});
