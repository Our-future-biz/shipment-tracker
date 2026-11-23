import { describe, expect, it, vi } from "vitest";

// The figures rule sits beside code that names API errors; the box's fill itself raises none.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { containerCapacity } from "../../../lib/containerCapacity";
import { boxUtilization, meterOf, wholePct, type BoxShipment } from "../lib/boxUtilization";
import { NOT_STACKABLE } from "../lib/cargoProjection";

// A 40' HC: 64.9 cbm planning of 76.4 inside; 26,200 kg standard, 28,400 at most.

let n = 0;
const shipment = (more: Partial<BoxShipment> = {}): BoxShipment => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  jobNumber: `CZLCL${String(n).padStart(8, "0")}`,
  customer: "Alfa s.r.o.",
  status: "active",
  cancelled: false,
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
const fill = (shipments: BoxShipment[], type = "40' HC") => boxUtilization(type, containerCapacity(type), shipments);

describe("wholePct", () => {
  it("never claims more than is true", () => {
    expect(wholePct(99.6, 100)).toBe(99);
    expect(wholePct(100, 100)).toBe(100);
    expect(wholePct(100.01, 100)).toBe(101);
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
    expect(over.weight).toMatchObject({ pct: 104, state: "over", free: -800 });
    expect(over.fullPct).toBe(104);
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
    const box = boxUtilization("53' HC", containerCapacity("53' HC"), [typed("10", "30")]);
    expect(box).toMatchObject({ capacity: null, volume: null, weight: null, fullPct: null, limitedBy: null });
    expect(box.totals).toMatchObject({ weightKg: 10000, volumeCbm: 30 });
    expect(box.rows[0]).toMatchObject({ weightSharePct: null, volumeSharePct: null, implausible: false });
  });

  it("adds W/M shipment by shipment, as it is charged", () => {
    // 2 t on 5 cbm is 5 W/M; 8 t on 3 cbm is 8 W/M: 13 together, not the 10 of the box's totals.
    expect(fill([typed("2", "5"), typed("8", "3")]).totals.freightTons).toBe(13);
  });

  it("holds 250 shipments without losing one", () => {
    const box = fill(Array.from({ length: 250 }, () => typed("0.1", "0.2")));
    expect(box.totals).toMatchObject({ shipments: 250, weightKg: 25000, volumeCbm: 50 });
    expect(box.rows).toHaveLength(250);
  });
});
