import { describe, expect, it } from "vitest";
import { balanceOf } from "./balance";
import { DEFAULT_RULES } from "./containers";
import { findSpot, newFloor, occupy } from "./floor";
import type { CargoLine } from "./gauge";
import { pinPlaceWords } from "./dangerous";
import { pinsNotKept, planLoad, type ContainerLoad } from "./plan";

const line = (id: string, l: number, w: number, h: number, kg: number, colli: number, more: Partial<CargoLine> = {}): CargoLine => ({ id, name: id, lengthMm: l, widthMm: w, heightMm: h, weightKg: kg, colli, canTurn: true, stackable: false, ...more });
const pallets = (id: string, colli: number, more: Partial<CargoLine> = {}) => line(id, 1200, 800, 1500, 400, colli, more);
const of = (load: ContainerLoad, id: string) => load.pieces.filter((p) => p.lineId === id);
const colliOf = (plan: { loads: ContainerLoad[] }, id: string) => plan.loads.map((load) => of(load, id).length);

describe("pins (Council Outlay 14, P8)", () => {
  it("leaves a plan without pins exactly as it was", () => {
    const cargo = [pallets("a", 12), line("b", 2000, 1200, 1800, 900, 3)];
    const plain = planLoad(cargo, undefined, DEFAULT_RULES);
    expect(plain.pinNotes).toBeUndefined();
    // The same cargo with the pin fields present but empty is planned the same.
    expect(planLoad(cargo.map((c) => ({ ...c, pinEnd: undefined, pinBox: undefined })), undefined, DEFAULT_RULES)).toEqual(plain);
  });

  it("finds the free place nearest the doors for a piece pinned there", () => {
    const floor = newFloor(12000, 2350);
    const spot = findSpot(floor, 1200, 800, "doors")!;
    expect(spot.z).toBe(10800);
    occupy(floor, spot, 1200, 800);
    // The next one stands beside it at the door end, not before it.
    expect(findSpot(floor, 1200, 800, "doors")!.z).toBe(10800);
  });

  it("puts a line pinned to the front wall before all other cargo, and one pinned to the doors behind it", () => {
    const cargo = [pallets("first-in", 4, { pinEnd: "front" }), pallets("any", 6), pallets("first-out", 4, { pinEnd: "doors" })];
    const plan = planLoad(cargo, ["40hc"], DEFAULT_RULES);
    expect(plan.notLoaded).toEqual([]);
    expect(plan.loads).toHaveLength(1);
    const [load] = plan.loads;
    const end = (id: string) => Math.max(...of(load!, id).map((p) => p.z + p.length));
    const start = (id: string) => Math.min(...of(load!, id).map((p) => p.z));
    // Along the container: the front-wall line ends where the others begin, the door line starts where they end.
    expect(end("first-in")).toBeLessThanOrEqual(start("any"));
    expect(end("any")).toBeLessThanOrEqual(start("first-out"));
    expect(plan.pinNotes).toBeUndefined();
  });

  it("keeps that order when the load is centred, whatever the weights", () => {
    // The heavy line is pinned to the doors: unpinned, the planner would bring it to the middle.
    const cargo = [line("light", 1200, 1000, 1000, 100, 6), line("heavy", 1200, 1000, 1000, 2000, 2, { pinEnd: "doors" })];
    const plan = planLoad(cargo, ["20dc"], DEFAULT_RULES);
    const [load] = plan.loads;
    expect(Math.min(...of(load!, "heavy").map((p) => p.z))).toBeGreaterThanOrEqual(Math.max(...of(load!, "light").map((p) => p.z + p.length)));
    // The plan says honestly when that leaves the container out of balance.
    expect(typeof balanceOf(load!.pieces, load!.container).ok).toBe("boolean");
    expect(pinsNotKept(plan.loads, cargo)).toEqual([]);
  });

  it("loads lines with one container number into one container, first in the plan, and fills it with other cargo", () => {
    const cargo = [pallets("any", 30), pallets("customer-a", 5, { pinBox: 1 }), line("crate-a", 2000, 1500, 1500, 800, 1, { pinBox: 1 })];
    const plan = planLoad(cargo, ["40hc"], DEFAULT_RULES);
    expect(plan.notLoaded).toEqual([]);
    // Container 1 holds all of the pinned cargo; the unpinned pallets fill it up and go on into the next.
    expect(colliOf(plan, "customer-a")[0]).toBe(5);
    expect(colliOf(plan, "crate-a")[0]).toBe(1);
    expect(colliOf(plan, "any")[0]).toBeGreaterThan(0);
    expect(colliOf(plan, "any").reduce((a, b) => a + b, 0)).toBe(30);
    expect(plan.pinNotes).toBeUndefined();
  });

  it("keeps lines with different container numbers apart, in the order of their numbers", () => {
    const cargo = [pallets("b", 3, { pinBox: 2 }), pallets("a", 3, { pinBox: 1 })];
    const plan = planLoad(cargo, ["20dc"], DEFAULT_RULES);
    expect(plan.loads).toHaveLength(2);
    expect(colliOf(plan, "a")).toEqual([3, 0]);
    expect(colliOf(plan, "b")).toEqual([0, 3]);
  });

  it("does not send pinned cargo to another container when its own has no room: it is not loaded, and says so", () => {
    // 14 pallets do not go on the floor of one 20' DC (11 do).
    const plan = planLoad([pallets("a", 14, { pinBox: 1 })], ["20dc"], DEFAULT_RULES);
    expect(plan.loads).toHaveLength(1);
    const loaded = colliOf(plan, "a")[0]!;
    expect(loaded).toBeLessThan(14);
    expect(plan.notLoaded).toEqual([{ lineId: "a", name: "a", colli: 14 - loaded, reason: "Pinned to container no. 1 (#1 of the plan), which has no room for it with the other cargo pinned there." }]);
  });

  it("takes the equipment the neediest pinned piece needs for the whole pinned container", () => {
    // 3 m high: an open top. The pallets pinned with it travel in the same one.
    const plan = planLoad([line("silo", 3000, 2000, 3000, 4000, 1, { pinBox: 1 }), pallets("with-it", 4, { pinBox: 1 })], undefined, DEFAULT_RULES);
    expect(plan.loads).toHaveLength(1);
    expect(plan.loads[0]!.container.group).toBe("open-top");
    expect(colliOf(plan, "with-it")).toEqual([4]);
  });

  it("says which pins a plan does not keep", () => {
    const container = planLoad([pallets("x", 1)], ["20dc"], DEFAULT_RULES).loads[0]!.container;
    const piece = (lineId: string, z: number, x = 0) => ({ lineId, name: lineId, x, y: 0, z, length: 1200, width: 800, height: 1500, weightKg: 400, crosswise: false });
    const lines = [pallets("front", 1, { pinEnd: "front" }), pallets("doors", 1, { pinEnd: "doors" }), pallets("other", 2), pallets("a", 1, { pinBox: 1 })];
    const load = (pieces: ReturnType<typeof piece>[]): ContainerLoad => ({ container, pieces, totalWeightKg: 0 });
    // Other cargo stands between the pinned piece and its end; cargo beside it does not count.
    // The plan's containers by their place ("#1"), a pinned number as "container no. 1".
    expect(pinsNotKept([load([piece("other", 0), piece("front", 1200)])], lines)).toEqual(["Container #1: front could not be kept at the front wall; other cargo stands before it."]);
    expect(pinsNotKept([load([piece("other", 0, 800), piece("front", 1200)])], lines)).toEqual([]);
    expect(pinsNotKept([load([piece("doors", 0), piece("other", 1200)])], lines)).toEqual(["Container #1: doors could not be kept at the doors; other cargo stands behind it."]);
    expect(pinsNotKept([load([piece("a", 0)]), load([piece("other", 0)]), load([piece("a", 0)])], lines)).toEqual(["The cargo pinned to container no. 1 is in 2 containers: #1, #3."]);
  });

  it("packs and centres the containers without an end-pinned line as if no end were pinned", () => {
    // A machine pinned to the front wall of its own container: the pallets do not go in with it.
    const machine = line("machine", 5700, 2200, 2000, 5000, 1, { pinEnd: "front", pinBox: 1, canTurn: false });
    const pallets = [line("pallet", 1200, 1000, 1000, 300, 40)];
    const alone = planLoad(pallets, ["20dc"], DEFAULT_RULES);
    expect(alone.loads).toHaveLength(4);
    const withMachine = planLoad([machine, ...pallets], ["20dc"], DEFAULT_RULES);
    expect(colliOf(withMachine, "machine")).toEqual([1, 0, 0, 0, 0]);
    expect(withMachine.loads.slice(1)).toEqual(alone.loads);
    // A heavy and a light line, centred around the heavy one as ever, though the plan has an end pin elsewhere.
    const rest = [line("light", 1200, 1000, 1000, 100, 6), line("heavy", 1200, 1000, 1000, 2000, 2)];
    const plain = planLoad(rest, ["20dc"], DEFAULT_RULES);
    const pinnedElsewhere = planLoad([machine, ...rest], ["20dc"], DEFAULT_RULES);
    expect(pinnedElsewhere.loads.slice(1)).toEqual(plain.loads);
    expect(balanceOf(pinnedElsewhere.loads[1]!.pieces, pinnedElsewhere.loads[1]!.container).ok).toBe(true);
  });

  it("says which of the plan's containers each pinned number is: a number is a name, not a place", () => {
    const plan = planLoad([pallets("a", 3, { pinBox: 2 }), pallets("free", 20)], ["20dc"], DEFAULT_RULES);
    expect(plan.loads.map((load) => load.pinBox)).toEqual([2, undefined, undefined]);
    expect(colliOf(plan, "a")).toEqual([3, 0, 0]);
    expect(pinPlaceWords(plan, 2)).toBe(" (#1 of the plan)");
    expect(pinPlaceWords(plan, 3)).toBe(" (not loaded)");
    expect(pinPlaceWords(plan, undefined)).toBe("");
    // Two numbers: each its own container, by their order.
    const two = planLoad([pallets("b", 3, { pinBox: 5 }), pallets("a", 3, { pinBox: 2 })], ["20dc"], DEFAULT_RULES);
    expect(two.loads.map((load) => load.pinBox)).toEqual([2, 5]);
    expect(pinPlaceWords(two, 5)).toBe(" (#2 of the plan)");
  });
});

describe("pins on the screen and in what is saved", () => {
  it("names a line's pins, and a change of them is something to save", async () => {
    const { pinWords } = await import("./dangerous");
    const { completeLine, newDraftLine, planFingerprint } = await import("./cargoForm");
    expect(pinWords({ pinEnd: "doors", pinBox: 2 })).toBe("at the doors · container no. 2");
    expect(pinWords({ pinEnd: "front" })).toBe("at the front wall");
    expect(pinWords({})).toBe("");
    const draft = { ...newDraftLine("a"), name: "Pallet", lengthMm: 1200, widthMm: 800, heightMm: 1000, weightKg: 300 };
    expect(completeLine({ ...draft, pinEnd: "doors", pinBox: 2 })).toMatchObject({ pinEnd: "doors", pinBox: 2 });
    expect(completeLine(draft)).not.toHaveProperty("pinEnd");
    expect(planFingerprint("P", [draft], null, null)).not.toBe(planFingerprint("P", [{ ...draft, pinEnd: "doors" }], null, null));
    expect(planFingerprint("P", [draft], null, null)).not.toBe(planFingerprint("P", [{ ...draft, pinBox: 1 }], null, null));
  });
});
