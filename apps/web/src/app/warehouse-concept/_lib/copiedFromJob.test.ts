import { describe, expect, it } from "vitest";
import { copiedFromJob } from "./copiedFromJob";

const line = (pieces: string, l: string, w: string, h: string, kg: string, volumePerPcM3 = "") => ({ pieces, lengthCm: l, widthCm: w, heightCm: h, weightPerPcKg: kg, volumePerPcM3 });

// The same figures the server's import takes (warehouseConcept tests/copiedCargo.test.ts).
describe("copiedFromJob (user council W3)", () => {
  it("takes the typed totals when they are there", () => {
    expect(copiedFromJob({ pcs: "1,200", totalWeightTons: "4,2", totalVolumeCbm: "9,6", cargoDimensions: [line("1", "100", "100", "100", "10")] })).toEqual({
      colli: 1200,
      weightKg: 4200,
      measureCbm: 9.6,
    });
  });

  it("fills an empty Total Weight / Total Volume from the job's dimension lines", () => {
    expect(copiedFromJob({ pcs: "6", totalWeightTons: "", totalVolumeCbm: "", cargoDimensions: [line("6", "120", "80", "125", "308.3333")] })).toEqual({
      colli: 6,
      weightKg: 1850,
      measureCbm: 7.2,
    });
    expect(copiedFromJob({ cargoDimensions: [line("2", "", "", "", "100", "0.5")] })).toMatchObject({ weightKg: 200, measureCbm: 1 });
  });

  it("takes empty Pcs from the dimension lines' pieces, as Shipments' declaredFigures does", () => {
    const lines = [line("4", "100", "100", "100", "50"), line("2", "", "", "", "10", "0.5")];
    expect(copiedFromJob({ pcs: "", cargoDimensions: lines }).colli).toBe(6);
    expect(copiedFromJob({ pcs: "10", cargoDimensions: lines }).colli).toBe(10);
  });

  it("without dimension lines, takes the job's other line totals", () => {
    expect(copiedFromJob({ totalGrossWeightKg: "21,500", totalVolumeM3: "58.08", cargoDimensions: [] })).toMatchObject({ weightKg: 21500, measureCbm: 58.08 });
    expect(copiedFromJob({})).toEqual({ colli: 0, weightKg: 0, measureCbm: 0 });
  });
});
