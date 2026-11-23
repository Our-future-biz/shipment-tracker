import { describe, expect, it } from "vitest";
import { CONTAINERS } from "./containers";
import { findSpot, newFloor, occupy } from "./floor";
import { fitIn, footprints, gaugeLabel, gaugeOf, type CargoLine } from "./gauge";
import { isOutOfGauge, overhang, planLoad, type LoadPlan } from "./plan";

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

  it("names the gauge", () => {
    expect(gaugeLabel(gaugeOf(line("crate", 1200, 800, 1000, 500)))).toBe("In Gauge");
    expect(gaugeLabel(gaugeOf(line("pipe", 14000, 800, 800, 3000)))).toBe("Over Length");
    expect(gaugeLabel(gaugeOf(line("machine", 6000, 3000, 3200, 15000)))).toBe("Over Width + Height");
    // 13 m goes into a 45' HQ.
    expect(gaugeLabel(gaugeOf(line("pipe", 13000, 800, 800, 3000)))).toBe("In Gauge");
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
    expect(names(planLoad([line("pipe", 13000, 800, 800, 3000)]))).toEqual(["45' HQ"]);
  });

  it("loads every piece of a larger lot, and the last container is no bigger than it needs", () => {
    // One layer for now: 25 pallets cover the floor of a 40', 11 that of a 20'.
    const plan = planLoad([line("pallet", 1200, 800, 1000, 400, { colli: 40 })]);
    expect(loadedCount(plan)).toBe(40);
    expect(plan.notLoaded).toEqual([]);
    expect(names(plan)).toEqual(["40' DC", "40' DC"]);
    expectSoundFloors(plan);

    expect(names(planLoad([line("pallet", 1200, 800, 1000, 400, { colli: 35 })]))).toEqual(["40' DC", "20' DC"]);
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
      { lineId: expect.any(String), name: "transformer", colli: 1, reason: "Weighs 40,000 kg; the heaviest payload of the equipment is 33,500 kg." },
    ]);
  });

  it("sends over-height cargo to an open top, the one it sticks out of least", () => {
    // A hard-top would stick out less, but a plain open top comes first.
    const tall = planLoad([line("column", 1000, 1000, 3000, 2000)]);
    expect(names(tall)).toEqual(["20' OT"]);
    expect(names(planLoad([line("column", 1000, 1000, 3000, 2000)], ["20ht", "40dc"]))).toEqual(["20' Hard-Top"]);
    expect(overhang(piece(tall), load(tall).container).height).toBe(623);

    // 2,650 mm: too high for a standard door, in gauge in a 40' HOT.
    const plan = planLoad([line("tank", 8000, 2200, 2650, 8000)]);
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
    expect(piece(wide)).toMatchObject({ x: (2210 - 3000) / 2, z: 0, width: 3000 });
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

  describe("nominated equipment", () => {
    it("uses only the nominated types", () => {
      const plan = planLoad([line("pallet", 1200, 800, 1000, 600, { colli: 10 })], ["40hc"]);
      expect(names(plan)).toEqual(["40' HC"]);
    });

    it("lists cargo the nominated equipment cannot take, saying what it needs", () => {
      const plan = planLoad([line("machine", 6000, 3000, 2500, 15000), line("column", 1000, 1000, 3000, 2000)], ["40hc"]);
      expect(plan.loads).toEqual([]);
      expect(plan.notLoaded.map((n) => n.reason)).toEqual([
        "Does not fit the nominated equipment; it needs a flat rack.",
        "Does not fit the nominated equipment; it needs an open top.",
      ]);
    });

    it("moves cargo to the next kind of equipment when its own is not nominated", () => {
      const plan = planLoad([line("pallet", 1200, 800, 1000, 600, { colli: 3 })], ["40fr"]);
      expect(names(plan)).toEqual(["40' FR"]);
      expect(loadedCount(plan)).toBe(3);
    });

    it("loads nothing when no equipment is nominated", () => {
      const plan = planLoad([line("pallet", 1200, 800, 1000, 600, { colli: 3 })], []);
      expect(plan.notLoaded).toEqual([{ lineId: expect.any(String), name: "pallet", colli: 3, reason: "No equipment is nominated." }]);
    });
  });
});
