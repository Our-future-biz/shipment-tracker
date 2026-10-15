import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { chargeableKgOf, splitCents, splitTripCost, splitWeight } from "../lib/costSplit";
import { DEFAULT_FACTORS } from "../lib/settingsRules";

const leg = (id: string, over: { chargeableKg?: number | null; weightKg?: number; ldm?: number; cbm?: number; palletPlaces?: number } = {}) => ({
  id,
  chargeableKg: over.chargeableKg ?? null,
  load: { weightKg: over.weightKg ?? 0, ldm: over.ldm ?? 0, cbm: over.cbm ?? 0, palletPlaces: over.palletPlaces ?? 0 },
});

const sum = (m: Map<string, number>) => Math.round([...m.values()].reduce((a, x) => a + x, 0) * 100) / 100;

describe("trip cost split (largest remainder)", () => {
  it("splits 100.00 three ways exactly to the cent; the left-over cent goes to the first", () => {
    expect(splitCents(10000, [1, 1, 1])).toEqual([3334, 3333, 3333]);
    const m = splitTripCost(100, [leg("a", { chargeableKg: 500 }), leg("b", { chargeableKg: 500 }), leg("c", { chargeableKg: 500 })], "chargeable_weight", DEFAULT_FACTORS);
    expect([...m.values()]).toEqual([33.34, 33.33, 33.33]);
    expect(sum(m)).toBe(100);
  });

  it("splits by chargeable weight: an uneven 3-way split still adds up to the total", () => {
    const m = splitTripCost(
      12345.67,
      [leg("a", { chargeableKg: 1250 }), leg("b", { chargeableKg: 333 }), leg("c", { chargeableKg: 4417 })],
      "chargeable_weight",
      DEFAULT_FACTORS,
    );
    expect(sum(m)).toBe(12345.67);
    expect(m.get("a")).toBe(2572.01);
    expect(m.get("b")).toBe(685.19); // 685.1847 lost the most in rounding: it gets the left-over cent
    expect(m.get("c")).toBe(9088.47);
  });

  it("works the chargeable weight out of the load when the consignment has none (pallets × 400 beats 300 kg)", () => {
    expect(chargeableKgOf(leg("a", { weightKg: 300, palletPlaces: 2 }), DEFAULT_FACTORS)).toBe(800);
    expect(chargeableKgOf(leg("a", { weightKg: 900, ldm: 0.4 }), DEFAULT_FACTORS)).toBe(900);
  });

  it("uses the haulier's basis: loading metres or pallet places instead of the weight", () => {
    const legs = [leg("a", { chargeableKg: 9000, ldm: 1, palletPlaces: 3 }), leg("b", { chargeableKg: 1000, ldm: 3, palletPlaces: 1 })];
    expect([...splitTripCost(1000, legs, "chargeable_weight", DEFAULT_FACTORS).values()]).toEqual([900, 100]);
    expect([...splitTripCost(1000, legs, "ldm", DEFAULT_FACTORS).values()]).toEqual([250, 750]);
    expect([...splitTripCost(1000, legs, "pallet_places", DEFAULT_FACTORS).values()]).toEqual([750, 250]);
    expect(splitWeight("ldm", legs[1]!, DEFAULT_FACTORS)).toBe(3);
  });

  it("gives a leg that weighs nothing under the basis 0, and shares equally when no leg weighs anything", () => {
    expect([...splitTripCost(90, [leg("a", { ldm: 2 }), leg("b", { ldm: 0 })], "ldm", DEFAULT_FACTORS).values()]).toEqual([90, 0]);
    expect([...splitTripCost(100, [leg("a"), leg("b"), leg("c")], "ldm", DEFAULT_FACTORS).values()]).toEqual([33.34, 33.33, 33.33]);
  });

  it("splits again from scratch when a leg is added (the parts always add up)", () => {
    const two = splitTripCost(5000, [leg("a", { chargeableKg: 1000 }), leg("b", { chargeableKg: 1000 })], "chargeable_weight", DEFAULT_FACTORS);
    const three = splitTripCost(5000, [leg("a", { chargeableKg: 1000 }), leg("b", { chargeableKg: 1000 }), leg("c", { chargeableKg: 2000 })], "chargeable_weight", DEFAULT_FACTORS);
    expect([...two.values()]).toEqual([2500, 2500]);
    expect([...three.values()]).toEqual([1250, 1250, 2500]);
  });

  it("splits nothing without legs and refuses bad weights", () => {
    expect(splitTripCost(100, [], "ldm", DEFAULT_FACTORS).size).toBe(0);
    expect(() => splitCents(100, [-1, 2])).toThrow();
    expect(() => splitCents(1.5, [1])).toThrow();
    expect(splitCents(-100, [1, 2])).toEqual([-33, -67]);
  });
});
