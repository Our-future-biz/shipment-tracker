import { describe, expect, it } from "vitest";
import { checkOog } from "@/lib/oogGauge";
import { DEFAULT_RULES } from "./containers";
import type { CargoLine } from "./gauge";
import { gaugeCheckOf, isOog } from "./loadStats";
import { planLoad, type LoadPlan } from "./plan";
import { boxesWords, canPutOnQuote, droppedTypes, gaugeWords, planForQuote, putOnQuoteRefusal } from "./planOnQuote";

const line = (id: string, l: number, w: number, h: number, kg: number, colli = 1, more: Partial<CargoLine> = {}): CargoLine => ({ id, name: id, lengthMm: l, widthMm: w, heightMm: h, weightKg: kg, colli, canTurn: true, stackable: false, ...more });
const open = { containerQuote: true, closed: false };

describe("Put the plan on the quote (Council Outlay 14, P7)", () => {
  it("offers the plan's equipment as container lines, with the cargo weight per container", () => {
    const found = planForQuote(planLoad([line("pallet", 1200, 800, 1500, 400, 20)], ["20dc"], DEFAULT_RULES));
    expect(found).toMatchObject({ containers: [{ qty: 2, type: "20' DC", weight: 4000 }], oog: null, gaugeTypes: [], unknown: [], notLoaded: 0 });
    expect(putOnQuoteRefusal(found, open)).toBeNull();
    expect(boxesWords(found.containers)).toBe("2 × 20' DC (4,000 kg each)");
    expect(boxesWords([])).toBe("None");
  });

  it("fills the out-of-gauge block from a flat rack's cargo, by the one table", () => {
    const found = planForQuote(planLoad([line("tank", 6000, 3000, 2500, 9000, 1, { canTurn: false })], ["40fr"], DEFAULT_RULES));
    expect(found.containers).toEqual([{ qty: 1, type: "40' FR", weight: 9000 }]);
    expect(found.oog).toEqual({ inGauge: false, length: 600, width: 300, height: 250 });
    expect(gaugeWords(found.oog)).toBe("Out of gauge · 600 × 300 × 250 cm (L × W × H)");
    // Narrow and low enough: in gauge.
    expect(planForQuote(planLoad([line("frame", 6000, 2400, 1500, 9000, 1, { canTurn: false })], ["40fr"], DEFAULT_RULES)).oog).toMatchObject({ inGauge: true, width: 240 });
    expect(gaugeWords(undefined)).toBe("Not answered");
  });

  it("gives the quote's check of the block the verdict the plan gives its open top or flat rack", () => {
    // What the quote says of the block, and what the plan says of the type's containers (the worst of them).
    const agree = (plan: LoadPlan) => {
      const found = planForQuote(plan);
      expect(found.gaugeTypes).toHaveLength(1);
      const [type] = found.gaugeTypes;
      const quote = checkOog(type!, found.oog!)!;
      const checks = plan.loads.filter((l) => l.container.name === type).map((l) => gaugeCheckOf(l)!);
      expect({ oog: isOog(quote), doesNotFit: quote.doesNotFit !== null, inGauge: found.oog!.inGauge }).toEqual({
        oog: checks.some(isOog),
        doesNotFit: checks.some((c) => c.doesNotFit !== null),
        inGauge: !checks.some(isOog),
      });
      return found.oog;
    };
    const plan = (cargo: CargoLine[], nominated: string[]) => planLoad(cargo, nominated, DEFAULT_RULES);
    // Two 6 m crates on a 40' OT, each through its roof: in gauge, the block one crate - not 12 m of cargo "too long for the roof".
    expect(agree(plan([line("crate", 6000, 2000, 2300, 3000, 2, { canTurn: false })], ["40ot"]))).toEqual({ inGauge: true, length: 600, width: 200, height: 230 });
    // A beam through the doors of one 20' OT, a column out of the roof of the other: the column stands for them.
    expect(agree(plan([line("beam", 5500, 2000, 1150, 500, 1, { canTurn: false }), line("column", 1000, 1000, 3000, 2000)], ["20ot"]))).toEqual({ inGauge: false, length: 100, width: 100, height: 300 });
    agree(plan([line("silo", 4000, 2000, 3000, 9000)], ["40ot"]));
    agree(plan([line("girder", 13000, 1000, 1500, 9000), line("tank", 6000, 3000, 1500, 9000, 1, { canTurn: false })], ["40fr"]));
    agree(plan([line("case", 6000, 2000, 1960, 9000)], ["40fr"]));
    agree(plan([line("frame", 6000, 2400, 1500, 9000, 1, { canTurn: false })], ["40fr"]));
  });

  it("writes no out-of-gauge block for cargo on two types, which one block cannot describe", () => {
    const found = planForQuote(planLoad([line("girder", 13000, 1000, 1500, 9000, 1, { canTurn: false }), line("silo", 4000, 2000, 3000, 6000, 1, { canTurn: false })], ["40fr", "20ot"], DEFAULT_RULES));
    expect(new Set(found.gaugeTypes)).toEqual(new Set(["40' FR", "20' OT"]));
    expect(found.oog).toBeNull();
    expect(found.containers.map((c) => c.type).sort()).toEqual(["20' OT", "40' FR"]);
    expect(putOnQuoteRefusal(found, open)).toBeNull();
  });

  it("is confirmed only once the plan and the planner's settings are read", () => {
    const found = planForQuote(planLoad([line("pallet", 1200, 800, 1500, 400, 20)], ["20dc"], DEFAULT_RULES));
    expect(canPutOnQuote(found, null, false)).toBe(true);
    expect(canPutOnQuote(found, null, true)).toBe(false);
    expect(canPutOnQuote(found, "This quote is closed: its cargo can no longer be changed.", false)).toBe(false);
    expect(canPutOnQuote(null, null, false)).toBe(false);
  });

  it("names the container types that leave the quote", () => {
    expect(droppedTypes([{ qty: 1, type: "40' HC" }, { qty: 2, type: "20' DC" }], [{ qty: 1, type: "40' HFR" }, { qty: 1, type: "20' DC" }])).toEqual(["40' HC"]);
    expect(droppedTypes([], [{ qty: 1, type: "40' HFR" }])).toEqual([]);
  });

  it("refuses what a quote cannot take", () => {
    const found = planForQuote(planLoad([line("pallet", 1200, 800, 1500, 400, 4)], ["20hc"], DEFAULT_RULES));
    expect(found.unknown).toEqual(["20' HC"]);
    expect(putOnQuoteRefusal(found, open)).toContain("has no 20' HC");
    const fine = planForQuote(planLoad([line("pallet", 1200, 800, 1500, 400, 4)], ["40hc"], DEFAULT_RULES));
    expect(putOnQuoteRefusal(fine, { containerQuote: false, closed: false })).toContain("Only a Sea FCL quote");
    expect(putOnQuoteRefusal(fine, { containerQuote: true, closed: true })).toContain("closed");
    expect(putOnQuoteRefusal(planForQuote({ loads: [], notLoaded: [] }), open)).toContain("loads no container");
  });
});
