import { describe, expect, it } from "vitest";
import { declaredTotals, EMPTY_LINE, lineInvalid, linesTotals, parseLines, pctText, reweighVariance, serializeLines, toNum, variance, wm } from "./cargoCompare";

const line = (pieces: string, l: string, w: string, h: string, kg: string) => ({ pieces, lengthCm: l, widthCm: w, heightCm: h, weightPerPcKg: kg });

describe("numbers", () => {
  it("reads plain numbers strictly, with a decimal comma", () => {
    expect(toNum("")).toBe(0);
    expect(toNum("1,5")).toBe(1.5);
    expect(toNum("12")).toBe(12);
    expect(toNum("12 kg")).toBeNaN();
    expect(toNum("-1")).toBeNaN();
    expect(lineInvalid(line("1.5", "", "", "", ""))).toBe(true); // pieces are whole
    expect(lineInvalid(line("2", "120", "80", "100", "250,5"))).toBe(false);
  });
});

describe("lines", () => {
  it("totals pieces, gross kg and cbm like the server", () => {
    const rows = [line("2", "120", "80", "100", "250"), line("1", "100", "100", "50", "99.9")];
    expect(linesTotals(rows)).toEqual({ pieces: 3, kg: 599.9, cbm: 2.42 });
  });
  it("stores only filled lines in the shape Shipments reads, and reads them back", () => {
    const json = serializeLines([line("2", "120,0", "80", "100", "250"), { ...EMPTY_LINE }]);
    expect(JSON.parse(json)).toEqual([{ pieces: "2", lengthCm: "120", widthCm: "80", heightCm: "100", weightPerPcKg: "250" }]);
    expect(parseLines(json)).toEqual([line("2", "120", "80", "100", "250")]);
    expect(parseLines("not json")).toEqual([]);
    expect(parseLines(undefined)).toEqual([]);
    expect(parseLines(JSON.stringify([{ pieces: 3 }]))).toEqual([line("3", "", "", "", "")]);
  });
});

describe("declared", () => {
  it("uses the shipment totals (tonnes to kg)", () => {
    expect(declaredTotals({ pcs: "10", totalWeightTons: "1.25", totalVolumeCbm: "4.5" })).toEqual({ pieces: 10, kg: 1250, cbm: 4.5 });
  });
  it("falls back to the cargo dimensions, and is null when nothing is declared", () => {
    expect(declaredTotals({ pcs: "", totalWeightTons: "", totalVolumeCbm: "", cargoDimensions: [line("2", "100", "100", "100", "50")] })).toEqual({
      pieces: 2,
      kg: 100,
      cbm: 2,
    });
    expect(declaredTotals({ pcs: "", totalWeightTons: null, totalVolumeCbm: null, cargoDimensions: [] })).toBeNull();
    expect(declaredTotals(null)).toBeNull();
  });
});

describe("W/M and variance", () => {
  it("W/M is the larger of cbm and tonnes", () => {
    expect(wm({ kg: 1250, cbm: 4.5 })).toBe(4.5);
    expect(wm({ kg: 8000, cbm: 4.5 })).toBe(8);
    expect(wm(null)).toBe(0);
  });
  it("flags any piece difference", () => {
    expect(variance({ pieces: 10, kg: 100, cbm: 1 }, { pieces: 11, kg: 100, cbm: 1 })).toMatchObject({ pieces: true, any: true });
  });
  it("flags weight / volume only beyond 5 %", () => {
    const a = { pieces: 10, kg: 1000, cbm: 10 };
    expect(variance(a, { pieces: 10, kg: 1050, cbm: 10.5 }).any).toBe(false); // exactly 5 %
    const v = variance(a, { pieces: 10, kg: 1051, cbm: 9.4 });
    expect(v).toMatchObject({ pieces: false, kg: true, cbm: true, any: true });
    expect(pctText(v.cbmPct)).toBe("−6.0 %");
  });
  it("does not compare unknown figures", () => {
    expect(variance({ pieces: 0, kg: 0, cbm: 0 }, { pieces: 4, kg: 10, cbm: 1 }).any).toBe(false);
    expect(variance(null, { pieces: 4, kg: 10, cbm: 1 }).any).toBe(false);
  });
});

describe("re-weigh against the declared weight", () => {
  it("flags more than 5 % either way, like the remeasurement", () => {
    expect(reweighVariance(1050, 1000)).toEqual({ pct: 0.05, flagged: false });
    expect(reweighVariance(1062, 1000)).toEqual({ pct: 0.062, flagged: true });
    expect(reweighVariance(940, 1000)).toEqual({ pct: -0.06, flagged: true });
    expect(pctText(reweighVariance(1062, 1000).pct)).toBe("+6.2 %");
  });
  it("does not compare when either side is unknown", () => {
    expect(reweighVariance(1000, null)).toEqual({ pct: null, flagged: false });
    expect(reweighVariance(null, 1000)).toEqual({ pct: null, flagged: false });
    expect(reweighVariance(1000, 0)).toEqual({ pct: null, flagged: false });
  });
});
