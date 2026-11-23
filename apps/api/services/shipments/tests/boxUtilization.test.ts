import { describe, expect, it, vi } from "vitest";

// The figures rule sits beside code that names API errors; the box's fill itself raises none.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { capacityOf, containerCapacity } from "../../../lib/containerCapacity";
import { boxFillOf, boxUtilization, meterOf, wholePct, type BoxShipment } from "../lib/boxUtilization";
import { NOT_STACKABLE } from "../lib/cargoProjection";

// A 40' HC: 64.9 cbm planning of 76.4 inside; 26,200 kg standard, 28,400 at most.

let n = 0;
const shipment = (more: Partial<BoxShipment> = {}): BoxShipment => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  jobNumber: `CZLCL${String(n).padStart(8, "0")}`,
  customer: "Alfa s.r.o.",
  status: "active",
  cancelled: false,
  odd: null,
  dangerous: "",
  outOfGauge: "",
  temperatureControlled: "",
  pcs: "",
  totalWeightTons: null,
  totalVolumeCbm: null,
  cargoDimensions: [],
  ...more,
});
/** A shipment with typed totals only: tonnes and cbm. */
const typed = (tons: string, cbm: string, more: Partial<BoxShipment> = {}) => shipment({ totalWeightTons: tons, totalVolumeCbm: cbm, ...more });
const line = (pieces: string, l: string, w: string, h: string, kg: string, more: Partial<BoxShipment["cargoDimensions"][number]> = {}) => ({
  pieces,
  lengthCm: l,
  widthCm: w,
  heightCm: h,
  weightPerPcKg: kg,
  volumePerPcM3: "",
  stackable: "",
  ...more,
});
const PLAN = { planningPct: 85, inlandWeightKg: null, containers: 1 };
const fill = (shipments: BoxShipment[], type = "40' HC") => boxUtilization(type, containerCapacity(type), shipments, PLAN);

describe("wholePct", () => {
  it("never claims more than is true", () => {
    expect(wholePct(99.6, 100)).toBe(99);
    expect(wholePct(100, 100)).toBe(100);
    expect(wholePct(100.01, 100)).toBe(101);
    expect(wholePct(108.02, 100)).toBe(108);
    expect(wholePct(108.6, 100)).toBe(109);
    expect(wholePct(0, 100)).toBe(0);
    expect(wholePct(5, 0)).toBe(0);
  });
});

describe("meterOf", () => {
  it("says room, nearly full from 90%, over the limit, and beyond what the box can take", () => {
    expect(meterOf(50, 64.9, 76.4, 3)).toMatchObject({ pct: 77, state: "room", free: 14.9 });
    expect(meterOf(58.41, 64.9, 76.4, 3)).toMatchObject({ pct: 90, state: "nearly_full" });
    expect(meterOf(64.9, 64.9, 76.4, 3)).toMatchObject({ pct: 100, state: "nearly_full", free: 0 });
    expect(meterOf(66.1, 64.9, 76.4, 3)).toMatchObject({ pct: 102, state: "over", free: -1.2 });
    expect(meterOf(80, 64.9, 76.4, 3)).toMatchObject({ state: "beyond" });
  });
});

describe("boxUtilization", () => {
  it("shows an empty box with all its room", () => {
    const box = fill([]);
    expect(box).toMatchObject({ containerType: "40' HC", fullPct: 0, limitedBy: null, notCounted: 0, rows: [], missing: { weight: 0, volume: 0 } });
    expect(box.totals).toEqual({ shipments: 0, colli: 0, weightKg: 0, volumeCbm: 0, freightTons: 0 });
    expect(box.volume).toMatchObject({ used: 0, limit: 64.9, max: 76.4, pct: 0, free: 64.9, state: "room" });
    expect(box.weight).toMatchObject({ used: 0, limit: 26200, max: 28400, pct: 0, free: 26200, state: "room" });
  });

  it("adds up typed totals, tonnes as kilograms, and names the fuller meter", () => {
    const box = fill([typed("6.4", "11.2", { pcs: "40" }), typed("17.7", "41.2", { pcs: "1,172" })]);
    expect(box.totals).toEqual({ shipments: 2, colli: 1212, weightKg: 24100, volumeCbm: 52.4, freightTons: 52.4 });
    expect(box.volume).toMatchObject({ used: 52.4, pct: 80, free: 12.5, state: "room" });
    expect(box.weight).toMatchObject({ used: 24100, pct: 91, free: 2100, state: "nearly_full" });
    expect(box).toMatchObject({ fullPct: 91, limitedBy: "weight" });
  });

  it("reads a shipment's cargo lines before its typed totals, as its own page does", () => {
    // 10 × 120 × 80 × 100 cm at 250 kg, and 2 pieces of 1.5 m³ typed: 9.6 + 3 cbm, 2,500 + 800 kg.
    const lines = shipment({ totalWeightTons: "99", totalVolumeCbm: "99", cargoDimensions: [line("10", "120", "80", "100", "250"), line("2", "", "", "", "400", { volumePerPcM3: "1,5" })] });
    expect(fill([lines]).rows[0]).toMatchObject({ colli: 12, weightKg: 3300, volumeCbm: 12.6, freightTons: 12.6 });
  });

  it("takes the typed total where a line lacks the figure", () => {
    const unweighed = shipment({ totalWeightTons: "1.2", cargoDimensions: [line("1", "100", "100", "100", "600"), line("1", "100", "100", "100", "")] });
    expect(fill([unweighed]).rows[0]).toMatchObject({ weightKg: 1200, volumeCbm: 2 });
  });

  it("counts a shipment without a weight or a volume as zero, and says how many", () => {
    const box = fill([typed("5", "10"), typed("", "6.1"), shipment({ pcs: "8" })]);
    expect(box.missing).toEqual({ weight: 2, volume: 1 });
    expect(box.totals).toMatchObject({ shipments: 3, weightKg: 5000, volumeCbm: 16.1 });
    expect(box.rows.map((r) => [r.weightMissing, r.volumeMissing])).toEqual([
      [false, false],
      [true, false],
      [true, true],
    ]);
  });

  it("lists a cancelled shipment last and leaves it out of the totals and the missing figures", () => {
    const box = fill([typed("", "", { status: "Cancelled Shipment", cancelled: true }), typed("5", "10")]);
    expect(box).toMatchObject({ notCounted: 1, missing: { weight: 0, volume: 0 } });
    expect(box.totals).toMatchObject({ shipments: 1, weightKg: 5000, volumeCbm: 10 });
    expect(box.rows.map((r) => r.counted)).toEqual([true, false]);
  });

  it("puts the biggest share of the box first and gives each shipment's share", () => {
    const box = fill([typed("2", "3"), typed("13.1", "5"), typed("1", "32.45")]);
    expect(box.rows.map((r) => [r.weightSharePct, r.volumeSharePct])).toEqual([
      // Two shipments take half the box each: the one with more volume comes first.
      [3.8, 50],
      [50, 7.7],
      [7.6, 4.6],
    ]);
  });

  it("shows a box over its limit, and one beyond what it can ever take, without refusing either", () => {
    const over = fill([typed("27", "66")]);
    expect(over.volume).toMatchObject({ pct: 102, state: "over", free: -1.1 });
    expect(over.weight).toMatchObject({ pct: 103, state: "over", free: -800 });
    expect(over.fullPct).toBe(103);
    const beyond = fill([typed("14", "40"), typed("15", "40")]);
    expect(beyond.volume?.state).toBe("beyond");
    expect(beyond.weight?.state).toBe("beyond");
  });

  it("is exactly full at the limit and not a percent before", () => {
    expect(fill([typed("26.2", "10")]).weight).toMatchObject({ pct: 100, free: 0, state: "nearly_full" });
    expect(fill([typed("26.1", "10")]).weight).toMatchObject({ pct: 99 });
  });

  it("flags cargo that is not stackable, dangerous, out of gauge or temperature controlled", () => {
    const box = fill([typed("1", "2", { dangerous: "Yes", outOfGauge: "No", temperatureControlled: "yes", cargoDimensions: [line("1", "100", "100", "200", "1000", { stackable: NOT_STACKABLE })] })]);
    expect(box.rows[0]).toMatchObject({ notStackable: true, dangerous: true, outOfGauge: false, temperatureControlled: true });
  });

  it("passes on why a shipment is an odd one in the box, and counts it all the same", () => {
    const box = fill([typed("1", "2", { odd: "Air Freight" }), typed("1", "2")]);
    expect(box.rows.map((r) => r.odd).sort()).toEqual(["Air Freight", null].sort());
    expect(box.totals.shipments).toBe(2);
  });

  it("flags figures no cargo has: heavier or bigger than the whole box, or an impossible density", () => {
    expect(fill([typed("12000", "20")]).rows[0]!.implausible).toBe(true); // kilograms typed as tonnes
    expect(fill([typed("5", "90")]).rows[0]!.implausible).toBe(true); // more than the box's inside volume
    expect(fill([typed("0.1", "50")]).rows[0]!.implausible).toBe(true); // 2 kg per cbm
    expect(fill([typed("5", "20")]).rows[0]!.implausible).toBe(false);
    expect(fill([typed("5", "")]).rows[0]!.implausible).toBe(false);
  });

  it("measures a reefer and a flat rack by weight only", () => {
    const box = fill([typed("10", "30")], "40' HRF");
    expect(box.volume).toBeNull();
    expect(box.weight).toMatchObject({ used: 10000, limit: 27600, pct: 36 });
    expect(box).toMatchObject({ fullPct: 36, limitedBy: "weight" });
    expect(box.rows[0]).toMatchObject({ volumeSharePct: null, weightSharePct: 36.2 });
    expect(box.totals.volumeCbm).toBe(30);
    expect(fill([typed("10", "30")], "40' FR").volume).toBeNull();
  });

  it("still gives the totals for a container type without capacity figures, with no percentage", () => {
    const box = boxUtilization("53' HC", containerCapacity("53' HC"), [typed("10", "30")], PLAN);
    expect(box).toMatchObject({ capacity: null, volume: null, weight: null, fullPct: null, limitedBy: null });
    expect(box.totals).toMatchObject({ weightKg: 10000, volumeCbm: 30 });
    expect(box.rows[0]).toMatchObject({ weightSharePct: null, volumeSharePct: null, implausible: false });
  });

  it("adds W/M shipment by shipment, as it is charged", () => {
    // 2 t on 5 cbm is 5 W/M; 8 t on 3 cbm is 8 W/M: 13 together, not the 10 of the box's totals.
    expect(fill([typed("2", "5"), typed("8", "3")]).totals.freightTons).toBe(13);
  });

  it("is full at the service's inland weight when that is below the box's own limit", () => {
    const inland = (kg: number | null, cargo = [typed("23", "10")]) => boxUtilization("40' HC", containerCapacity("40' HC"), cargo, { planningPct: 85, inlandWeightKg: kg, containers: 1 });
    expect(inland(24000).weight).toMatchObject({ used: 23000, limit: 24000, max: 28400, pct: 95, free: 1000, state: "nearly_full" });
    expect(inland(24000).capacity).toMatchObject({ inlandKg: 24000, standardKg: 26200 });
    expect(inland(22000).weight).toMatchObject({ pct: 105, state: "over", free: -1000 });
    expect(inland(24000).rows[0]!.weightSharePct).toBe(95.8);
    // An inland weight at or above the box's own limit changes nothing, and neither does none.
    expect(inland(26200).weight).toMatchObject({ limit: 26200 });
    expect(inland(30000).capacity).toMatchObject({ inlandKg: null });
    expect(inland(null).weight).toMatchObject({ limit: 26200, pct: 87 });
  });

  it("plans the volume to the company's share of the inside volume", () => {
    const at = (pct: number) => boxUtilization("40' HC", containerCapacity("40' HC", pct / 100), [typed("5", "65")], { planningPct: pct, inlandWeightKg: null, containers: 1 });
    expect(at(85).volume).toMatchObject({ limit: 64.9, pct: 101, state: "over" });
    expect(at(90).volume).toMatchObject({ limit: 68.8, pct: 94, state: "nearly_full" });
    expect(at(100).volume).toMatchObject({ limit: 76.4, max: 76.4, pct: 85, state: "room" });
    expect(at(90).capacity).toMatchObject({ planningPct: 90, planningCbm: 68.8 });
  });

  it("adds up the capacity of a sailing's containers", () => {
    const two = (cargo: BoxShipment[], inlandWeightKg: number | null = null) =>
      boxUtilization("40' HC", capacityOf(2, containerCapacity("40' HC")!), cargo, { planningPct: 85, inlandWeightKg, containers: 2 });
    // Two 40' HC: 129.8 cbm planning of 152.8 inside; 52,400 kg standard, 56,800 at most.
    const box = two([typed("27", "66")]);
    expect(box.capacity).toMatchObject({ containers: 2, insideCbm: 152.8, planningCbm: 129.8, standardKg: 52400, heavyTestedKg: 56800, maxKg: 56800 });
    expect(box.volume).toMatchObject({ limit: 129.8, pct: 50, state: "room" });
    expect(box.weight).toMatchObject({ limit: 52400, pct: 51, state: "room" });
    // The inland weight is a container's: two of them carry twice it.
    expect(two([typed("27", "66")], 24000).weight).toMatchObject({ limit: 48000, pct: 56 });
    expect(two([typed("27", "66")], 24000).capacity).toMatchObject({ inlandKg: 48000 });
  });

  it("holds 250 shipments without losing one", () => {
    const box = fill(Array.from({ length: 250 }, () => typed("0.1", "0.2")));
    expect(box.totals).toMatchObject({ shipments: 250, weightKg: 25000, volumeCbm: 50 });
    expect(box.rows).toHaveLength(250);
  });
});

describe("boxFillOf", () => {
  it("is the box in short: both percentages, how they stand, and how many shipments lack a figure", () => {
    const fill = boxFillOf(boxUtilization("40' HC", containerCapacity("40' HC"), [typed("6.4", "11.2"), typed("17.7", "41.2"), typed("", "1"), typed("", "", { cancelled: true })], PLAN));
    expect(fill).toEqual({ volume: { pct: 82, state: "room" }, weight: { pct: 91, state: "nearly_full" }, fullPct: 91, shipments: 3, missing: 1 });
  });

  it("has no volume for a reefer and nothing for a type without capacity", () => {
    expect(boxFillOf(boxUtilization("40' HRF", containerCapacity("40' HRF"), [typed("10", "30")], PLAN))).toMatchObject({ volume: null, weight: { pct: 36, state: "room" }, fullPct: 36 });
    expect(boxFillOf(boxUtilization("53' HC", containerCapacity("53' HC"), [], PLAN))).toEqual({ volume: null, weight: null, fullPct: null, shipments: 0, missing: 0 });
  });
});
