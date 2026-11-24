import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "./containers";
import type { CargoLine } from "./gauge";
import { oogRequestOf, oogRequestText } from "./oogRequest";
import { planLoad } from "./plan";

const line = (name: string, l: number, w: number, h: number, kg: number, more: Partial<CargoLine> = {}): CargoLine => ({ id: name, name, lengthMm: l, widthMm: w, heightMm: h, weightKg: kg, colli: 1, canTurn: false, stackable: false, ...more });
const first = (cargo: CargoLine, nominated: string[]) => planLoad([cargo], nominated, DEFAULT_RULES).loads[0]!;

describe("the out-of-gauge request of a container (Council Outlay 14, P10)", () => {
  it("says what stands out of a flat rack on each side, above and over each end, with the weight and the centre of gravity", () => {
    // 13 m long, 3 m wide, 2.5 m high on a 40' FR (in gauge 1,150 x 244 x 194 cm), centred by the plan.
    const request = oogRequestOf(first(line("Girder", 13000, 3000, 2500, 9000), ["40fr"]), 2)!;
    expect(request).toMatchObject({ number: 2, type: "40' FR", flatRack: true, colli: 1, cargo: ["Girder"], weightKg: 9000, grossKg: 14200 });
    expect(request.overall).toEqual({ length: 1300, width: 300, height: 250 });
    expect(request.overWidth).toEqual({ left: 28, right: 28 });
    expect(request.overHeight).toBe(56);
    expect(request.overLength).toEqual({ front: 75, back: 75 });
    // The middle of a 11,652 mm deck that is 2,374 mm wide; half the cargo's height.
    expect(request.gravity).toEqual({ fromFront: 583, fromLeft: 119, height: 125 });
    expect(request.lostSlots).toBeGreaterThan(0);
  });

  it("gives an open top only its over-height", () => {
    const request = oogRequestOf(first(line("Silo", 4000, 2000, 3000, 9000), ["40ot"]), 1)!;
    expect(request.flatRack).toBe(false);
    expect(request.overHeight).toBe(66);
    expect(request.overWidth).toEqual({ left: 0, right: 0 });
    expect(request.overLength).toEqual({ front: 0, back: 0 });
  });

  it("has nothing to request for cargo in gauge, a standard container or a hard-top", () => {
    expect(oogRequestOf(first(line("Frame", 6000, 2400, 1500, 9000), ["40fr"]), 1)).toBeNull();
    expect(oogRequestOf(first(line("Box", 1000, 1000, 1000, 500), ["40hc"]), 1)).toBeNull();
    expect(oogRequestOf(first(line("Column", 1000, 1000, 3000, 2000), ["20ht"]), 1)).toBeNull();
  });

  it("writes the request as text to copy", () => {
    const text = oogRequestText(oogRequestOf(first(line("Girder", 13000, 3000, 2500, 9000), ["40fr"]), 2)!, " Machines to Nhava Sheva ");
    expect(text.split("\n")).toEqual([
      "OUT-OF-GAUGE REQUEST",
      "Plan: Machines to Nhava Sheva",
      "Container: 40' FR (no. 2 of the plan)",
      "Cargo: 1 colli - Girder",
      "Cargo overall (L x W x H): 1,300 x 300 x 250 cm",
      "In gauge up to (L x W x H): 1,150 x 244 x 194 cm",
      "Over-width: left 28 cm, right 28 cm",
      "Over-height: 56 cm",
      "Over-length: left end 75 cm, right end 75 cm",
      "Cargo weight: 9,000 kg (with the container, estimated: 14,200 kg)",
      "Centre of gravity: 583 cm from the left end, 119 cm from the left side, about 125 cm above the floor",
      expect.stringMatching(/^Lost slots, indicative: \d+ \(counted as 20' slots\)$/),
      "Figures from our loading plan; the weight is the cargo's as declared.",
    ]);
    // An open top has a front wall and doors; a plan with no name leaves its line out.
    const open = oogRequestText(oogRequestOf(first(line("Silo", 4000, 2000, 3000, 9000), ["40ot"]), 1)!, "");
    expect(open).not.toContain("Plan:");
    expect(open).toContain("Over-length: front wall 0 cm, door end 0 cm");
  });
});
