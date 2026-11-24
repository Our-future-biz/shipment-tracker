import { describe, expect, it } from "vitest";
import { balanceOf, centreLoad, floorHolds, floorOverloads } from "./balance";
import { CONTAINERS, containersWith, DEFAULT_RULES, maxWeightOn, restingNeeded } from "./containers";
import { findSpot, newFloor, occupy } from "./floor";
import { fitIn, fitLabel, footprints, gaugeOf, standardLabel, type CargoLine } from "./gauge";
import { floorOverloadText, gaugeCheckOf, gaugeText, loadStats, ruleWarnings } from "./loadStats";
import { isOutOfGauge, overhang, planLoad, type ContainerLoad, type LoadPlan } from "./plan";

let nextId = 0;
const line = (name: string, lengthMm: number, widthMm: number, heightMm: number, weightKg: number, more: Partial<CargoLine> = {}): CargoLine => ({
  id: `line-${++nextId}`,
  name,
  lengthMm,
  widthMm,
  heightMm,
  weightKg,
  colli: 1,
  canTurn: true,
  stackable: false,
  ...more,
});
const spec = (id: string) => CONTAINERS.find((c) => c.id === id)!;
const names = (plan: LoadPlan) => plan.loads.map((load) => load.container.name);
const load = (plan: LoadPlan, index = 0) => plan.loads[index]!;
const piece = (plan: LoadPlan, index = 0) => load(plan, index).pieces[0]!;
const loadedCount = (plan: LoadPlan) => plan.loads.reduce((n, load) => n + load.pieces.length, 0);
/** The free floor between the cargo and the doors, in mm. */
const doorGap = (load: ContainerLoad) => load.container.internalL - Math.max(...load.pieces.map((p) => p.z + p.length));

/** No two pieces of a load share floor, and none leaves the floor except by flat-rack overhang. */
const expectSoundFloors = (plan: LoadPlan) => {
  for (const load of plan.loads) {
    const { container, pieces } = load;
    expect(load.totalWeightKg).toBeLessThanOrEqual(container.payloadKg);
    pieces.forEach((a, i) => {
      if (container.group !== "flat-rack") {
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.z).toBeGreaterThanOrEqual(0);
        expect(a.x + a.width).toBeLessThanOrEqual(container.internalW);
        expect(a.z + a.length).toBeLessThanOrEqual(container.internalL);
      }
      for (const b of pieces.slice(i + 1)) {
        const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.z + a.length <= b.z || b.z + b.length <= a.z;
        expect(apart, `${a.name} and ${b.name} overlap in ${container.name}`).toBe(true);
      }
    });
  }
};

describe("footprints and fit", () => {
  it("puts the long side along the container whichever side was typed as length", () => {
    expect(footprints(line("beam", 2000, 6000, 1000, 5000, { canTurn: false }))).toEqual([{ length: 6000, width: 2000, crosswise: false }]);
    expect(footprints(line("crate", 1200, 800, 1000, 500))).toHaveLength(2);
  });

  it("checks the door and the height of a standard container", () => {
    const column = line("column", 1000, 1000, 3000, 2000);
    expect(fitIn(spec("40hc"), column)).toEqual([]);
    expect(fitIn(spec("40ot"), column)).not.toEqual([]);
    // 2,650 mm is under the 40' HC roof but does not pass its 2,585 mm door.
    expect(fitIn(spec("40hc"), line("tall", 2000, 2000, 2650, 2000))).toEqual([]);
    expect(fitIn(spec("40hc"), line("wide", 3000, 2350, 2000, 2000))).toEqual([]);
  });

  it("lets a flat rack take any size lengthwise, and nothing over its payload", () => {
    expect(fitIn(spec("40fr"), line("pipe", 13000, 800, 800, 3000, { canTurn: false }))).toHaveLength(1);
    expect(fitIn(spec("40fr"), line("transformer", 6000, 3000, 3200, 40000))).toEqual([]);
  });

  it("says whether a standard container takes the piece", () => {
    expect(fitLabel(gaugeOf(line("crate", 1200, 800, 1000, 500)))).toBe("Fits");
    expect(fitLabel(gaugeOf(line("pipe", 14000, 800, 800, 3000)))).toBe("Too long");
    expect(fitLabel(gaugeOf(line("machine", 6000, 3000, 3200, 15000)))).toBe("Too wide + too high");
    // 13 m goes into a 45' HQ, which counts only when it is nominated.
    expect(fitLabel(gaugeOf(line("pipe", 13000, 800, 800, 3000)))).toBe("Too long");
    expect(fitLabel(gaugeOf(line("pipe", 13000, 800, 800, 3000), undefined, true))).toBe("Fits");
  });
});

describe("floor", () => {
  it("fills a floor without overlap and reports when it is full", () => {
    const floor = newFloor(2000, 2000);
    for (let i = 0; i < 4; i++) {
      const spot = findSpot(floor, 1000, 1000);
      expect(spot).not.toBeNull();
      occupy(floor, spot!, 1000, 1000);
    }
    expect(findSpot(floor, 1000, 1000)).toBeNull();
    expect(floor.free).toEqual([]);
  });

  it("centres a piece wider or longer than the floor", () => {
    const floor = newFloor(10000, 2000);
    expect(findSpot(floor, 4000, 3000)).toMatchObject({ x: -500, z: 0 });
    expect(findSpot(floor, 12000, 1000)).toMatchObject({ x: 0, z: -1000 });
  });
});

describe("planLoad", () => {
  it("puts one small crate into a 20' DC", () => {
    const plan = planLoad([line("crate", 1200, 800, 1000, 500)]);
    expect(names(plan)).toEqual(["20' DC"]);
    expect(plan.notLoaded).toEqual([]);
  });

  it("picks the smallest standard container the cargo fits: length, then height", () => {
    expect(names(planLoad([line("machine", 5000, 2200, 2200, 20000, { canTurn: false })]))).toEqual(["20' DC"]);
    expect(names(planLoad([line("machine", 8000, 2200, 2200, 20000)]))).toEqual(["40' DC"]);
    expect(names(planLoad([line("machine", 8000, 2200, 2500, 20000)]))).toEqual(["40' HC"]);
    expect(names(planLoad([line("pipe", 13000, 800, 800, 3000)], ["20dc", "40dc", "40hc", "45hq"]))).toEqual(["45' HQ"]);
  });

  it("loads every piece of a larger lot, and the last container is no bigger than it needs", () => {
    // Not stackable, so one layer: 25 pallets cover the floor of a 40', 11 that of a 20'.
    const plan = planLoad([line("pallet", 1200, 800, 1000, 400, { colli: 40 })]);
    expect(loadedCount(plan)).toBe(40);
    expect(plan.notLoaded).toEqual([]);
    expect(names(plan)).toEqual(["40' DC", "40' DC"]);
    expectSoundFloors(plan);

    expect(names(planLoad([line("pallet", 1200, 800, 1000, 400, { colli: 35 })]))).toEqual(["40' DC", "20' DC"]);
  });

  it("never puts a piece where another stands when it packs a load again around its heaviest piece", () => {
    // Laid out the textbook way first, then again around the heavy blocks: the places worked out for
    // the pallets must not be handed to the blocks once pallets stand there.
    const plan = planLoad([line("Euro pallet", 1200, 800, 1000, 500, { colli: 10 }), line("Steel block", 700, 600, 1000, 2600, { colli: 4 })]);
    expect(loadedCount(plan)).toBe(14);
    expectSoundFloors(plan);
  });

  it("lays standard pallets out the textbook way: ten 1,200 x 1,000 in a 20', eleven euro pallets", () => {
    const standard = planLoad([line("pallet", 1200, 1000, 1000, 500, { colli: 10 })]);
    expect(names(standard)).toEqual(["20' DC"]);
    expectSoundFloors(standard);
    expect(names(planLoad([line("pallet", 1200, 1000, 1000, 500, { colli: 21 })]))).toEqual(["40' DC"]);
    expect(names(planLoad([line("euro pallet", 1200, 800, 1000, 500, { colli: 11 })]))).toEqual(["20' DC"]);
    expect(names(planLoad([line("euro pallet", 1200, 800, 1000, 500, { colli: 25 })]))).toEqual(["40' DC"]);
    // Pieces that may not turn stay lengthwise: eight to a 20'.
    expect(names(planLoad([line("pallet", 1200, 1000, 1000, 500, { colli: 10, canTurn: false })], ["20dc"]))).toEqual(["20' DC", "20' DC"]);
  });

  it("opens another container when the payload is reached", () => {
    const plan = planLoad([line("coil", 1500, 1500, 1500, 12000, { colli: 5 })]);
    expect(loadedCount(plan)).toBe(5);
    expect(plan.loads.length).toBeGreaterThan(2);
    expectSoundFloors(plan);
  });

  it("lists a piece no container can carry, with the reason", () => {
    const plan = planLoad([line("transformer", 6000, 3000, 3200, 40000), line("crate", 1200, 800, 1000, 500)]);
    expect(loadedCount(plan)).toBe(1);
    expect(plan.notLoaded).toEqual([
      { lineId: expect.any(String), name: "transformer", colli: 1, reason: "Weighs 40,000 kg a piece; the most any allowed container carries is 33,500 kg." },
    ]);
  });

  it("loads an open top only with what passes its roof opening or its doors, as the quote's table says (P12)", () => {
    // 2,300 mm wide and too high for any door: wider than every roof opening, so it needs a flat rack.
    const wide = planLoad([line("frame", 4000, 2300, 2800, 3000)]);
    expect(load(wide).container.group).toBe("flat-rack");
    // 5,700 mm long: too long for a 20' OT's roof opening (5,300), low and narrow enough for its doors. Among open tops only, it stays in the 20'.
    expect(names(planLoad([line("beam", 5700, 1000, 2200, 3000)], ["20ot", "40ot"]))).toEqual(["20' OT"]);
    // The same beam too high for those doors goes into the 40' OT, from the top.
    expect(names(planLoad([line("beam", 5700, 1000, 2600, 3000)], ["20ot", "40ot"]))).toEqual(["40' OT"]);
  });

  it("sends over-height cargo to an open top, the one it sticks out of least", () => {
    // A hard-top would stick out less, but a plain open top comes first.
    const tall = planLoad([line("column", 1000, 1000, 3000, 2000)]);
    expect(names(tall)).toEqual(["20' OT"]);
    expect(names(planLoad([line("column", 1000, 1000, 3000, 2000)], ["20ht", "40dc"]))).toEqual(["20' Hard-Top"]);
    expect(overhang(piece(tall), load(tall).container).height).toBe(623);

    // 2,650 mm: too high for a standard door, in gauge in a 40' HOT, whose roof opening takes 2,160 mm of width.
    const plan = planLoad([line("tank", 8000, 2100, 2650, 8000)]);
    expect(names(plan)).toEqual(["40' HOT"]);
    expect(isOutOfGauge(piece(plan), load(plan).container)).toBe(false);
  });

  it("loads a piece long side along, so a beam typed crosswise still goes into a standard container", () => {
    const plan = planLoad([line("beam", 2000, 6000, 1000, 5000, { canTurn: false })]);
    expect(names(plan)).toEqual(["40' DC"]);
    expect(piece(plan)).toMatchObject({ length: 6000, width: 2000, crosswise: false });
  });

  it("sends over-width cargo to a flat rack, centred across it", () => {
    const wide = planLoad([line("machine", 5000, 3000, 2000, 15000)]);
    expect(names(wide)).toEqual(["20' FR"]);
    expect(piece(wide)).toMatchObject({ x: (2210 - 3000) / 2, z: (5612 - 5000) / 2, width: 3000 });
  });

  it("loads over-length cargo on a flat rack with equal overhang at both ends", () => {
    const plan = planLoad([line("girder", 15000, 1000, 1000, 9000)]);
    expect(names(plan)).toEqual(["40' FR"]);
    expect(piece(plan).z).toBe((11652 - 15000) / 2);
    expect(overhang(piece(plan), load(plan).container)).toEqual({ length: 3348, width: 0, height: 0 });
  });

  it("fills a flat rack that is in use before opening a standard container", () => {
    const plan = planLoad([line("machine", 6000, 3000, 2500, 15000, { canTurn: false }), line("pallet", 1200, 800, 1000, 600, { colli: 10 })]);
    expect(names(plan)).toEqual(["40' HFR"]);
    expect(loadedCount(plan)).toBe(11);
    expectSoundFloors(plan);
  });

  it("sends what the flat rack cannot take back to standard containers", () => {
    const plan = planLoad([line("machine", 11000, 3000, 2000, 15000), line("pallet", 1200, 800, 1000, 600, { colli: 10 })]);
    // The 11 m machine leaves no room for a pallet; a 20' flat rack would let it hang over the ends.
    expect(names(plan)).toEqual(["20' DC", "40' HFR"]);
    expect(load(plan, 1).pieces).toHaveLength(1);
    expect(loadedCount(plan)).toBe(11);
  });

  it("fills an open top in use before opening a standard container", () => {
    const plan = planLoad([line("tank", 4000, 2200, 3500, 8000), line("pallet", 1200, 800, 1000, 600, { colli: 4 })]);
    expect(plan.loads).toHaveLength(1);
    expect(load(plan).container.group).toBe("open-top");
    expect(loadedCount(plan)).toBe(5);
  });

  it("gives a piece longer than the flat rack a rack of its own, with nothing filled beside it", () => {
    const plan = planLoad([line("girder", 15000, 1000, 1000, 9000), line("crate", 1200, 1000, 1000, 500, { colli: 4 })]);
    const rack = plan.loads.find((l) => l.container.group === "flat-rack")!;
    expect(rack.pieces.map((p) => p.name)).toEqual(["girder"]);
    expect(loadedCount(plan)).toBe(5);
    // Two such pieces may share a rack.
    const two = planLoad([line("pipe", 14000, 800, 800, 3000, { colli: 2 })]);
    expect(names(two)).toEqual(["40' FR"]);
    expect(load(two).pieces).toHaveLength(2);
  });

  it("does not fill a flat rack with cargo that would add an overhang the load does not have", () => {
    // The machine is only over-width; crates 2.3 m high would stand over the end walls.
    const plan = planLoad([line("machine", 8000, 3000, 1900, 10000), line("crate", 1500, 1200, 2300, 800, { colli: 2 })]);
    const rack = plan.loads.find((l) => l.container.group === "flat-rack")!;
    expect(rack.pieces.map((p) => p.name)).toEqual(["machine"]);
    expect(loadedCount(plan)).toBe(3);
  });

  it("takes two wide pieces on one flat rack where they fit end to end", () => {
    const plan = planLoad([line("machine", 5000, 2500, 2000, 8000, { colli: 2 })]);
    expect(plan.loads).toHaveLength(1);
    expect(load(plan).container.feet).toBe(40);
    expect(balanceOf(load(plan).pieces, load(plan).container).ok).toBe(true);
    expectSoundFloors(plan);
  });

  it("centres a narrow row across the container when a full-width row pins the rest", () => {
    const plan = planLoad([line("wide", 3000, 2300, 1000, 1000), line("narrow", 2600, 1700, 1000, 2000, { colli: 3 })]);
    expect(plan.loads).toHaveLength(1);
    expect(balanceOf(load(plan).pieces, load(plan).container).ok).toBe(true);
    expectSoundFloors(plan);
  });

  it("plans the most a plan may hold in well under a second", () => {
    const started = performance.now();
    const cartons = planLoad([line("carton", 400, 300, 300, 12, { colli: 2000, stackable: true })]);
    const mixed = planLoad(Array.from({ length: 200 }, (_, i) => line(`item ${i}`, 400, 400, 400, 10 + i, { colli: 10 })));
    expect(loadedCount(cartons)).toBe(2000);
    expect(loadedCount(mixed)).toBe(2000);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("plans the most a plan may hold quickly also when it must choose among flat racks and open tops", () => {
    // A wide machine and a tall column make the planner try every flat-rack and open-top type, each
    // filled with the rest of the 2,000 colli: about half a second on a developer's machine.
    const boxes = Array.from({ length: 198 }, (_, i) => line(`box ${i}`, 300 + 7 * i, 200 + 3 * i, 300 + (i % 7) * 100, 10 + i, { colli: 10 }));
    const cargo = [line("wide", 5000, 3000, 2000, 9000), line("tall", 3000, 2000, 3000, 3000), ...boxes];
    const started = performance.now();
    const plan = planLoad(cargo, CONTAINERS.map((c) => c.id), DEFAULT_RULES);
    expect(loadedCount(plan)).toBe(1982);
    expect(performance.now() - started).toBeLessThan(3000);
  });

  describe("nominated equipment", () => {
    it("uses only the nominated types", () => {
      const plan = planLoad([line("pallet", 1200, 800, 1000, 600, { colli: 10 })], ["40hc"]);
      expect(names(plan)).toEqual(["40' HC"]);
    });

    it("lists cargo the nominated equipment cannot take, saying what it needs", () => {
      const plan = planLoad([line("machine", 6000, 3000, 2500, 15000), line("column", 1000, 1000, 3000, 2000)], ["40hc"]);
      expect(plan.loads).toEqual([]);
      expect(plan.notLoaded.map((n) => n.reason)).toEqual([
        "Does not fit the nominated equipment. It needs a flat rack.",
        "Does not fit the nominated equipment. It needs an open top.",
      ]);
    });

    it("moves cargo to the next kind of equipment when its own is not nominated", () => {
      const plan = planLoad([line("pallet", 1200, 800, 1000, 600, { colli: 3 })], ["40fr"]);
      expect(names(plan)).toEqual(["40' FR"]);
      expect(loadedCount(plan)).toBe(3);
    });

    it("names the type that would take a piece when its kind of equipment is nominated in another size", () => {
      // An 8 m tank too high for a standard container: a 20' open top is nominated, a 40' would take it.
      const plan = planLoad([line("tank", 8000, 2200, 3000, 5000)], ["20ot"]);
      expect(plan.notLoaded.map((n) => n.reason)).toEqual(["Does not fit the nominated equipment. A 40' OT would take it."]);
    });

    it("loads nothing when no equipment is nominated", () => {
      const plan = planLoad([line("pallet", 1200, 800, 1000, 600, { colli: 3 })], []);
      expect(plan.notLoaded).toEqual([{ lineId: expect.any(String), name: "pallet", colli: 3, reason: "No equipment is nominated." }]);
    });
  });

  describe("stacking", () => {
    it("stacks identical stackable pieces two high, so 40 pallets take one 40' DC", () => {
      const plan = planLoad([line("pallet", 1200, 800, 1000, 400, { colli: 40, stackable: true })]);
      expect(names(plan)).toEqual(["40' DC"]);
      expect(loadedCount(plan)).toBe(40);
      expect(load(plan).pieces.filter((p) => p.y === 1000)).toHaveLength(15);
      expect(Math.max(...load(plan).pieces.map((p) => p.y + p.height))).toBe(2000);
      expectSoundFloors({ loads: [{ ...load(plan), pieces: load(plan).pieces.filter((p) => p.y === 0) }], notLoaded: [] });
    });

    it("picks the high cube when the stack needs the height", () => {
      const plan = planLoad([line("crate", 1200, 800, 1300, 400, { colli: 20, stackable: true })]);
      expect(names(plan)).toEqual(["20' HC"]);
    });

    it("does not stack a piece on a different line, or three high", () => {
      const mixed = planLoad([line("base", 5800, 2300, 1000, 5000, { stackable: true }), line("other", 5800, 2300, 1000, 500, { stackable: true })]);
      expect(mixed.loads.flatMap((l) => l.pieces).every((p) => p.y === 0)).toBe(true);

      // A piece carries its own weight at most: one on top, never two.
      const three = planLoad([line("slab", 5800, 2300, 500, 3000, { colli: 3, stackable: true })]);
      expect(three.loads.flatMap((l) => l.pieces).map((p) => p.y).sort()).toEqual([0, 0, 500]);
    });

    it("keeps a stack inside the container and the load under the payload", () => {
      const tall = planLoad([line("crate", 5800, 2300, 1400, 1000, { colli: 2, stackable: true })]);
      expect(tall.loads).toHaveLength(1);
      expect(names(tall)).toEqual(["40' DC"]);

      const heavy = planLoad([line("block", 5800, 2300, 1000, 15000, { colli: 2, stackable: true })]);
      expect(heavy.loads).toHaveLength(2);
    });
  });

  describe("balance", () => {
    it("centres a single piece", () => {
      const plan = planLoad([line("crate", 1200, 800, 1000, 500)]);
      const balance = balanceOf(load(plan).pieces, load(plan).container);
      expect(Math.abs(balance.alongPct)).toBeLessThan(0.1);
      expect(Math.abs(balance.acrossPct)).toBeLessThan(0.1);
      expect(balance.ok).toBe(true);
    });

    it("balances the review loads the old planner left at one end", () => {
      const loads = [
        planLoad([line("machine", 5000, 2200, 2200, 20000, { canTurn: false })]),
        planLoad([line("pallet", 1200, 800, 1000, 400, { colli: 40 })]),
        planLoad([line("tank", 4000, 2200, 3500, 8000)]),
        planLoad([line("machine", 6000, 3000, 2500, 15000, { canTurn: false }), line("pallet", 1200, 800, 1000, 600, { colli: 10 })]),
      ];
      for (const plan of loads) {
        expectSoundFloors(plan);
        for (const l of plan.loads) expect(balanceOf(l.pieces, l.container).ok, l.container.name).toBe(true);
      }
    });

    it("swaps equal-sized pieces so the heavy ones sit in the middle", () => {
      const container = spec("20dc");
      const at = (z: number, weightKg: number) => ({ lineId: `w${weightKg}`, name: "block", x: 0, y: 0, z, length: 1900, width: 2352, height: 1000, weightKg, crosswise: false });
      // Three blocks fill the floor end to end, the heavy one at the far end.
      const pieces = [at(0, 1000), at(1900, 1000), at(3800, 9000)];
      centreLoad(pieces, container);
      expect(pieces.find((p) => p.weightKg === 9000)?.z).toBe(1900 + 99);
      expect(balanceOf(pieces, container).ok).toBe(true);
    });

    it("moves a heavy piece from the end of a filled flat rack to its middle", () => {
      // The machine is loaded first, at one end, and the pallets fill the rest of the flat rack.
      const plan = planLoad([
        line("pallet", 1200, 800, 1000, 400, { colli: 40, stackable: true }),
        line("machine", 5000, 3000, 2000, 15000),
      ]);
      expectSoundFloors({ loads: plan.loads.map((l) => ({ ...l, pieces: l.pieces.filter((p) => p.y === 0) })), notLoaded: [] });
      for (const l of plan.loads) expect(balanceOf(l.pieces, l.container).ok, l.container.name).toBe(true);
      const rack = plan.loads.find((l) => l.container.group === "flat-rack")!;
      const machine = rack.pieces.find((p) => p.name === "machine")!;
      expect(machine.z).toBeGreaterThan(2000);
      expect(machine.z + machine.length).toBeLessThan(rack.container.internalL - 2000);
    });

    it("puts the heaviest of several full-width pieces in the middle", () => {
      const container = spec("40fr");
      const at = (z: number, weightKg: number) => ({ lineId: `w${weightKg}`, name: "machine", x: -300, y: 0, z, length: 3000, width: 2974, height: 1500, weightKg, crosswise: false });
      const pieces = [at(0, 12000), at(3000, 2000), at(6000, 3000)];
      centreLoad(pieces, container);
      expect(pieces.map((p) => p.weightKg).sort((a, b) => pieces.find((p) => p.weightKg === a)!.z - pieces.find((p) => p.weightKg === b)!.z)).toEqual([3000, 12000, 2000]);
      expect(balanceOf(pieces, container).ok).toBe(true);
    });

    it("packs a load again around its heavy piece when it would stand in a corner", () => {
      // A 12 t coil with pallets beside it: left where it was first put, the load is far out of balance.
      const plan = planLoad([line("coil", 1000, 1000, 1000, 12000), line("pallet", 1200, 800, 1000, 400, { colli: 3 })]);
      expect(names(plan)).toEqual(["20' DC"]);
      expect(loadedCount(plan)).toBe(4);
      expectSoundFloors(plan);
      expect(balanceOf(load(plan).pieces, load(plan).container).ok).toBe(true);
      const coil = load(plan).pieces.find((p) => p.name === "coil")!;
      expect(coil.z).toBeGreaterThan(1500);
      expect(coil.z + coil.length).toBeLessThan(5898 - 1500);
    });

    it("allows the centre of gravity 60 cm off lengthwise on a 20' and 90 cm on a 40', a tenth of the half-width sideways", () => {
      const one = (id: string, offAlong: number, offAcross = 0) => {
        const container = spec(id);
        const piece = { lineId: "a", name: "case", y: 0, length: 1000, width: 1000, height: 1000, weightKg: 5000, crosswise: false };
        return balanceOf([{ ...piece, z: container.internalL / 2 - 500 + offAlong, x: container.internalW / 2 - 500 + offAcross }], container).ok;
      };
      expect(one("20dc", 590)).toBe(true);
      expect(one("20dc", -610)).toBe(false);
      expect(one("40hc", 890)).toBe(true);
      expect(one("40hc", 910)).toBe(false);
      expect(one("45hq", -890)).toBe(true);
      expect(one("40hc", 0, 110)).toBe(true);
      expect(one("40hc", 0, 125)).toBe(false);
    });

    it("reports a load it cannot balance", () => {
      const container = spec("20dc");
      const pieces = [
        { lineId: "a", name: "heavy", x: 0, y: 0, z: 0, length: 2949, width: 2352, height: 1000, weightKg: 9000, crosswise: false },
        { lineId: "b", name: "light", x: 0, y: 0, z: 2949, length: 2949, width: 2352, height: 1000, weightKg: 1000, crosswise: false },
      ];
      centreLoad(pieces, container);
      expect(balanceOf(pieces, container)).toMatchObject({ ok: false, acrossPct: 0 });
      expect(Math.abs(balanceOf(pieces, container).alongPct)).toBeCloseTo(40, 0);
    });
  });

  describe("floor load", () => {
    it("says how far the weight of a dense piece must be spread", () => {
      // 12 t on 1 m of a 20' wooden floor (4.8 t per metre) needs 2.5 m: beams 1 m beyond each end give 3 m.
      const plan = planLoad([line("coil", 1000, 1000, 1000, 12000)]);
      expect(names(plan)).toEqual(["20' DC"]);
      expect(floorOverloads(load(plan))).toEqual([{ names: ["coil"], fromMm: 2449, lengthMm: 1000, weightKg: 12000, tonnesPerMetre: 12, spreadMm: 2500 }]);
      expect(floorOverloads(load(planLoad([line("machine", 5000, 2200, 2200, 20000)])))).toEqual([]);
    });

    it("counts pieces standing side by side together: the floor is rated across its whole width", () => {
      // Two 7 t pieces abreast: each alone is 2.8 t per metre, together 5.6 on a floor rated for 3.
      const block = (x: number) => ({ lineId: "b", name: "block", x, y: 0, z: 4000, length: 2500, width: 1100, height: 1000, weightKg: 7000, crosswise: false });
      const abreast = { container: spec("40dc"), pieces: [block(0), block(1100)], totalWeightKg: 14000 };
      const [overload, ...more] = floorOverloads(abreast);
      expect(more).toEqual([]);
      expect(overload).toMatchObject({ names: ["block"], lengthMm: 2500, weightKg: 14000, spreadMm: 4667 });
      expect(overload?.tonnesPerMetre).toBeCloseTo(5.6, 5);
      // Beams 1 m beyond each end give 4,500 mm at most: the advice is not a length nobody can lay.
      expect(floorOverloadText(overload!, spec("40dc"), "mm")).toContain(
        "It cannot be bedded there: it needs 4,667 mm of floor, and beams reaching no more than 1,000 mm beyond each end give 4,500 mm. Take a piece off this stretch.",
      );
    });

    it("stands pieces end to end where side by side the floor would not carry them", () => {
      // Abreast, the two blocks would need 4,667 mm of floor; end to end each rests on its own 2.5 m.
      const plan = planLoad([line("block", 2500, 1100, 1000, 7000, { colli: 2, canTurn: false })], ["40dc"]);
      expect(names(plan)).toEqual(["40' DC"]);
      const [a, b] = load(plan).pieces;
      expect(a!.z + a!.length <= b!.z || b!.z + b!.length <= a!.z).toBe(true);
      expect(floorOverloads(load(plan))).toEqual([]);
    });

    it("weighs cargo standing end to end by what the floor carries on that length", () => {
      // Four 6.75 t cases end to end: 27 t on 9 m of a 40' floor, which carries 26 t there (3 t per metre is no more than allowed).
      const plan = planLoad([line("case", 2250, 2200, 1500, 6750, { colli: 4, canTurn: false })]);
      expect(names(plan)).toEqual(["40' DC"]);
      const [overload, ...more] = floorOverloads(load(plan));
      expect(more).toEqual([]);
      expect(overload).toMatchObject({ names: ["case"], lengthMm: 9000, weightKg: 27000, allowedKg: 26000, spreadMm: 9001 });
      expect(floorOverloadText(overload!, load(plan).container, "mm")).toBe(
        "case: 27,000 kg resting on 9,000 mm (this floor carries 26,000 kg on that length). Spread the weight over at least 9,001 mm with beams under the cargo, along the container, reaching no more than 1,000 mm beyond each end of a piece.",
      );
    });

    it("refuses cargo standing together that the floor cannot carry even with beams, as it refuses a single piece", () => {
      // One 14 t coil on 1 m of a 20' is carried with beams (14.4 t on 3 m); two together, abreast or end to end, are not.
      const plan = planLoad([line("coil", 1000, 1000, 1000, 14000, { colli: 2 })], ["20dc"]);
      expect(names(plan)).toEqual(["20' DC", "20' DC"]);
      for (const l of plan.loads) expect(floorHolds(l.pieces, l.container)).toBe(true);
    });

    it("weighs a flat rack's lone piece together with what stands beside it on the same length", () => {
      // A 16 t coil and a 3 t crate on the same metre of a 20' flat rack: 19 t rest there, not 16.
      const at = (name: string, x: number, weightKg: number) => ({ lineId: name, name, x, y: 0, z: 2000, length: 1000, width: 1000, height: 1000, weightKg, crosswise: false });
      const rack = { container: spec("20fr"), pieces: [at("coil", 0, 16000), at("crate", 1100, 3000)], totalWeightKg: 19000 };
      expect(floorOverloads(rack)).toEqual([{ names: ["coil", "crate"], fromMm: 2000, lengthMm: 1000, weightKg: 19000, tonnesPerMetre: 19, spreadMm: 2128, allowedKg: 15600 }]);
    });

    it("reads what a floor carries from the carrier's table, by the length the cargo rests on", () => {
      const on = (id: string, mm: number) => maxWeightOn(spec(id), mm);
      // Wooden floors: 4.8 t per running metre on a 20', 3 t on a 40' (less from 7 m on), never over the payload.
      expect([on("20dc", 1000), on("20dc", 4000), on("20dc", 5898)]).toEqual([4800, 19200, 28230]);
      expect([on("40dc", 1000), on("40dc", 6000), on("40dc", 8000), on("40dc", 9000), on("40dc", 12032)]).toEqual([3000, 18000, 23000, 26000, 28400]);
      expect(on("40ot", 2000)).toBe(6000);
      // Steel floors (the hard-tops): 7.6 t and 6 t per running metre.
      expect([on("20ht", 1000), on("40ht", 2000)]).toEqual([7600, 12000]);
      // Flat racks: half the payload of their class on any length, then the table from 2 m on, up to the planner's own 33.5 t.
      expect([on("20fr", 500), on("20fr", 2000), on("20fr", 3000), on("20fr", 4000)]).toEqual([15600, 18700, 21050, 23400]);
      expect([on("40fr", 1000), on("40fr", 2000), on("40fr", 6000), on("40fr", 11652)]).toEqual([19650, 21400, 26200, 33500]);
      expect([on("40hfr", 1000), on("40hfr", 2000), on("40hfr", 4000), on("40hfr", 8000)]).toEqual([24500, 25600, 29400, 33500]);
      // And back: the shortest length that carries a weight.
      expect(restingNeeded(spec("20dc"), 12000)).toBe(2500);
      expect(restingNeeded(spec("40hfr"), 25000)).toBe(2000);
      expect(restingNeeded(spec("40dc"), 30000)).toBeNull();
    });

    it("loads a container no heavier than its floor carries over its whole length", () => {
      // A 40' DC: the table ends at 28.4 t, under its 28.7 t payload.
      const plan = planLoad([line("ingot", 1000, 500, 300, 2000, { colli: 15 })], ["40dc"]);
      expect(plan.loads.map((l) => l.totalWeightKg)).toEqual([28000, 2000]);
    });

    it("moves a piece to a container whose floor can carry it on its length, counting 1 m of beams at each end", () => {
      // 20 t on 3 m: with beams it rests on 5 m. A 20' carries 24 t on that, a 40' only 15 t.
      expect(names(planLoad([line("press", 3000, 2000, 2000, 20000)]))).toEqual(["20' DC"]);
      expect(planLoad([line("press", 3000, 2000, 2000, 20000)], ["40dc"]).notLoaded.map((n) => n.reason)).toEqual([
        "Weighs 20,000 kg on 3,000 mm of floor: too much per metre for any allowed container, even with 1,000 mm of beams under each end. The most on that length is 15,000 kg, on a 40' DC.",
      ]);
      expect(planLoad([line("press", 5000, 2000, 2000, 30000)], ["20dc"]).notLoaded.map((n) => n.reason)).toEqual(["Weighs 30,000 kg a piece; the most any allowed container carries is 28,230 kg."]);
    });

    it("takes a 25 t coil on 1 m only on the strongest flat rack, with bedding, and refuses it elsewhere", () => {
      const coil = [line("coil", 1000, 1000, 1000, 25000)];
      // With beams it rests on 3 m: 14.4 t in a 20', 9 t in a 40', 21 t on a 20' flat rack, 22.5 t on a 40' one, 27.5 t on the high cube.
      const plan = planLoad(coil);
      expect(names(plan)).toEqual(["40' HFR"]);
      expect(floorOverloads(load(plan))).toEqual([expect.objectContaining({ names: ["coil"], lengthMm: 1000, weightKg: 25000, allowedKg: 24500, spreadMm: 2000 })]);
      expect(floorOverloadText(floorOverloads(load(plan))[0]!, load(plan).container, "mm")).toBe(
        "coil: 25,000 kg resting on 1,000 mm (this flat rack carries 24,500 kg on that length). Spread the weight over at least 2,000 mm with beams under the cargo, along the container, reaching no more than 1,000 mm beyond each end of a piece.",
      );
      expect(planLoad(coil, ["20dc", "40dc", "20ot", "40ot", "20fr", "40fr"]).notLoaded.map((n) => n.reason)).toEqual([
        "Weighs 25,000 kg on 1,000 mm of floor: too much per metre for any allowed container, even with 1,000 mm of beams under each end. The most on that length is 22,450 kg, on a 40' FR.",
      ]);
    });

    it("still warns about a point load on a flat rack when other cargo stands beside it", () => {
      const plan = planLoad([line("coil", 1000, 1000, 1000, 25000), line("pallet", 1200, 1000, 1000, 500, { colli: 10 })]);
      const rack = plan.loads.find((l) => l.pieces.some((p) => p.name === "coil"))!;
      expect(rack.container.name).toBe("40' HFR");
      expect(floorOverloads(rack)).toContainEqual(expect.objectContaining({ names: ["coil"], lengthMm: 1000, weightKg: 25000, allowedKg: 24500 }));
    });

    it("does not call a piece fitting a standard container when its floor cannot carry it", () => {
      expect(standardLabel(line("coil", 1000, 1000, 1000, 12000))).toBe("Fits");
      expect(standardLabel(line("coil", 1000, 1000, 1000, 25000))).toBe("Too heavy");
      // The company's rule moves a single piece over 10 t out of standard containers.
      expect(standardLabel(line("coil", 1000, 1000, 1000, 12000), DEFAULT_RULES)).toBe("Too heavy");
      expect(standardLabel(line("machine", 6000, 3000, 3200, 15000), DEFAULT_RULES)).toBe("Too wide + too high");
    });

    it("does not stack pieces into a stack heavier than the floor carries on its length", () => {
      // Two 9 t slabs of 1 m: one is carried with beams (14.4 t on 3 m of a 20'), a stack of two is not.
      const plan = planLoad([line("slab", 1000, 1000, 500, 9000, { colli: 2, stackable: true })], ["20dc"]);
      expect(loadedCount(plan)).toBe(2);
      expect(plan.loads.flatMap((l) => l.pieces).every((p) => p.y === 0)).toBe(true);
    });
  });
});

describe("the company's rules", () => {
  const ruled = (id: string) => containersWith(DEFAULT_RULES).find((c) => c.id === id)!;

  it("keeps a piece the size of the door out of a standard container once a clearance is set", () => {
    const doorSized = line("Case", 3000, 2343, 2280, 1000);
    expect(fitIn(spec("20dc"), doorSized).length).toBeGreaterThan(0);
    expect(fitIn(ruled("20dc"), doorSized)).toEqual([]);
    // 50 mm free beside and above it: 2,293 wide and 2,230 high still pass.
    expect(fitIn(ruled("20dc"), line("Case", 3000, 2293, 2230, 1000)).length).toBeGreaterThan(0);
    expect(fitIn(ruled("20dc"), line("Case", 3000, 2294, 2230, 1000))).toEqual([]);
    expect(fitIn(ruled("20dc"), line("Case", 3000, 2293, 2231, 1000))).toEqual([]);
  });

  it("leaves the sizes of open tops and flat racks as they are", () => {
    const doorSized = line("Case", 3000, 2338, 2600, 1000);
    expect(fitIn(ruled("40ot"), doorSized)).toEqual(fitIn(spec("40ot"), doorSized));
    expect(ruled("40fr").clear).toBeUndefined();
  });

  it("plans the door-sized piece into an open top instead", () => {
    const doorSized = [line("Case", 3000, 2300, 2280, 1000)];
    expect(planLoad(doorSized).loads[0]!.container.group).toBe("standard");
    expect(planLoad(doorSized, undefined, DEFAULT_RULES).loads[0]!.container.group).toBe("open-top");
  });

  it("keeps the length clearance free on the floor", () => {
    // Twelve rows of two 1,000 mm crates are 12,000 mm: they fill a 40' (12,032 mm) but not one with 100 mm left free.
    const rows = [line("Crate", 1000, 1000, 1000, 500, { colli: 24 })];
    expect(planLoad(rows, ["40dc"]).loads).toHaveLength(1);
    const plan = planLoad(rows, ["40dc"], DEFAULT_RULES);
    expect(plan.loads.map((load) => load.pieces.length)).toEqual([22, 2]);
    for (const load of plan.loads) expect(doorGap(load)).toBeGreaterThanOrEqual(100);
  });

  it("keeps the clearance at the doors when it centres a load", () => {
    // The heavy machine at the front pulls the load towards the doors; it may come no closer than 100 mm.
    const plan = planLoad([line("Machine", 3000, 2200, 2000, 9000, { canTurn: false }), line("Crate", 2798, 2200, 2000, 500, { canTurn: false })], ["20dc"], DEFAULT_RULES);
    expect(loadedCount(plan)).toBe(2);
    expect(doorGap(load(plan))).toBe(100);
    // Cartons filling the floor, slid to balance them.
    const cartons = planLoad([line("Carton", 400, 300, 300, 12, { colli: 2000, stackable: true })], undefined, DEFAULT_RULES);
    for (const load of cartons.loads) expect(doorGap(load)).toBeGreaterThanOrEqual(100);
  });

  it("says what a standard container takes with the clearance", () => {
    const high = line("Case", 2000, 1000, 2550, 1000);
    expect(fitLabel(gaugeOf(high))).toBe("Fits");
    expect(fitLabel(gaugeOf(high, DEFAULT_RULES.clearance))).toBe("Too high");
  });

  it("takes a 45' and a hard-top only when they are nominated", () => {
    const long = [line("Pipe bundle", 13000, 1000, 1000, 2000)];
    expect(planLoad(long).loads.map((load) => load.container.name)).toEqual(["40' FR"]);
    expect(planLoad(long, ["45hq"]).loads.map((load) => load.container.name)).toEqual(["45' HQ"]);
    // "Fits a standard container" follows: against the 40' unless a 45' is nominated.
    expect(fitLabel(gaugeOf(long[0]!))).toBe("Too long");
    expect(fitLabel(gaugeOf(long[0]!, undefined, true))).toBe("Fits");
    const high = [line("Machine", 3000, 2000, 2650, 20000)];
    expect(planLoad(high).loads[0]!.container.hardTop).toBeUndefined();
    expect(planLoad(high, ["40ht"]).loads[0]!.container.name).toBe("40' Hard-Top");
  });

  it("plans a single piece over the set weight onto an open top or flat rack, not into a standard container", () => {
    const heavy = [line("Press", 3000, 2000, 2000, 10001)];
    expect(planLoad(heavy).loads[0]!.container.group).toBe("standard");
    expect(planLoad(heavy, undefined, DEFAULT_RULES).loads[0]!.container.group).not.toBe("standard");
    expect(planLoad([line("Press", 3000, 2000, 2000, 10000)], undefined, DEFAULT_RULES).loads[0]!.container.group).toBe("standard");
    // Nominated standard containers only: it is not loaded, and the plan says what it needs.
    const refused = planLoad(heavy, ["40dc"], DEFAULT_RULES);
    expect(refused.loads).toEqual([]);
    expect(refused.notLoaded[0]!.reason).toContain("open top");
  });

  it("moves a heavy piece whose bedding would be more than twice its length", () => {
    // 8 t on a 40' floor (3 t/m) needs 2,667 mm of bedding: more than twice a 1,000 mm coil, not twice a 1,500 mm case.
    expect(fitIn(ruled("40dc"), line("Coil", 1000, 1000, 1000, 8000))).toEqual([]);
    expect(fitIn(ruled("40dc"), line("Case", 1500, 1000, 1000, 8000)).length).toBeGreaterThan(0);
    // A 20' floor (4.8 t/m) needs 1,667 mm: the coil stays.
    expect(fitIn(ruled("20dc"), line("Coil", 1000, 1000, 1000, 8000)).length).toBeGreaterThan(0);
    // A piece not heavy enough to be warned about is never moved for its bedding.
    expect(fitIn(ruled("40dc"), line("Block", 500, 500, 500, 4000)).length).toBeGreaterThan(0);
  });

  it("warns about a heavy piece that stays in a standard container", () => {
    const load = planLoad([line("Press", 3000, 2000, 2000, 6000)], undefined, DEFAULT_RULES).loads[0]!;
    expect(load.container.group).toBe("standard");
    expect(ruleWarnings(load, "mm")).toEqual([expect.stringContaining("Press: 6,000 kg a piece, over the 5,000 kg")]);
    expect(ruleWarnings(planLoad([line("Press", 3000, 2000, 2000, 5000)], undefined, DEFAULT_RULES).loads[0]!, "mm")).toEqual([]);
    // Without the company's rules nothing is warned about.
    expect(ruleWarnings(planLoad([line("Press", 3000, 2000, 2000, 6000)]).loads[0]!, "mm")).toEqual([]);
  });

  // The company's own limits are one thing, the out-of-gauge table's verdict another: these are about the first.
  const ownLimit = (text: string) => !/^(Out of gauge, by the same table|In gauge only with|Too long for the roof)/.test(text);

  it("gives a load the verdict the quote's out-of-gauge table gives the same cargo (P12)", () => {
    const stats = (cargo: CargoLine, nominated?: string[]) => {
      const plan = planLoad([cargo], nominated, DEFAULT_RULES);
      return { ...loadStats(plan.loads[0]!), text: gaugeText(gaugeCheckOf(plan.loads[0]!)), type: plan.loads[0]!.container.name };
    };
    // 2,400 mm wide on a 40' FR: wider than its deck, within the 244 cm slot, so in gauge.
    expect(stats(line("Frame", 6000, 2400, 1500, 9000, { canTurn: false }), ["40fr"])).toMatchObject({ outOfGauge: false, linerConfirm: false, text: null });
    // 3,000 mm wide: 28 cm over each side, the slot on each side lost (a 40' slot is two 20' slots).
    const wide = stats(line("Tank", 6000, 3000, 1500, 9000, { canTurn: false }), ["40fr"]);
    expect(wide.outOfGauge).toBe(true);
    expect(wide.text).toContain("28 cm over each side");
    expect(wide.text).toContain("About 4 lost slots");
    // 1,960 mm high on a 40' FR: over the in-gauge 194 cm, within the liner's 198 cm.
    const liner = stats(line("Case", 6000, 2000, 1960, 9000), ["40fr"]);
    expect(liner).toMatchObject({ outOfGauge: false, linerConfirm: true });
    expect(liner.text).toContain("liner's confirmation");
    // Over height in an open top: out of gauge by what stands out of the roof.
    expect(stats(line("Silo", 4000, 2000, 3000, 9000), ["40ot"]).text).toContain("66 cm over height");
    // A standard container is never out of gauge.
    expect(stats(line("Box", 1000, 1000, 1000, 500))).toMatchObject({ outOfGauge: false, linerConfirm: false, text: null });
  });

  it("warns about out-of-gauge cargo beyond the limits set, and loads it all the same", () => {
    const texts = (cargo: CargoLine) => {
      const plan = planLoad([cargo], undefined, DEFAULT_RULES);
      expect(plan.notLoaded).toEqual([]);
      return ruleWarnings(plan.loads[0]!, "mm").filter(ownLimit);
    };
    expect(texts(line("Tank", 6000, 3600, 2000, 9000, { canTurn: false }))).toEqual([expect.stringContaining("3,600 mm wide, over the 3,500 mm")]);
    expect(texts(line("Tank", 6000, 3500, 2000, 9000, { canTurn: false }))).toEqual([]);
    expect(texts(line("Silo", 4000, 2200, 3300, 9000))).toEqual([expect.stringContaining("3,300 mm high, over the 3,200 mm")]);
    // 14 m on an 11,652 mm deck, centred: 1,174 mm over each end.
    expect(texts(line("Girder", 14000, 1000, 1000, 9000))).toEqual([expect.stringContaining("1,174 mm over one end, over the 1,000 mm")]);
  });

  it("says nothing about out-of-gauge cargo just at the limits set", () => {
    const texts = (cargo: CargoLine) => ruleWarnings(planLoad([cargo], undefined, DEFAULT_RULES).loads[0]!, "mm").filter(ownLimit);
    // 13,652 mm on an 11,652 mm deck: exactly 1,000 mm over each end.
    expect(texts(line("Girder", 13652, 1000, 1000, 9000))).toEqual([]);
    expect(texts(line("Silo", 4000, 2200, 3200, 9000))).toEqual([]);
    expect(texts(line("Tank", 6000, 3500, 2000, 9000, { canTurn: false }))).toEqual([]);
  });
});
