import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "./containers";
import type { CargoLine } from "./gauge";
import { planLoad } from "./plan";
import { boxesWords, droppedTypes, gaugeWords, planForQuote, putOnQuoteRefusal } from "./planOnQuote";

const line = (id: string, l: number, w: number, h: number, kg: number, colli = 1, more: Partial<CargoLine> = {}): CargoLine => ({ id, name: id, lengthMm: l, widthMm: w, heightMm: h, weightKg: kg, colli, canTurn: true, stackable: false, ...more });
const open = { containerQuote: true, closed: false };

describe("Put the plan on the quote (Council Outlay 14, P7)", () => {
  it("offers the plan's equipment as container lines, with the cargo weight per container", () => {
    const found = planForQuote(planLoad([line("pallet", 1200, 800, 1500, 400, 20)], ["20dc"], DEFAULT_RULES));
    expect(found).toMatchObject({ containers: [{ qty: 2, type: "20' DC", weight: 4000 }], oog: null, unknown: [], notLoaded: 0 });
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
