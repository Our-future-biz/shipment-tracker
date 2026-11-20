import { describe, expect, it } from "vitest";
import { copiedCargo } from "../services/copiedCargo";

describe("copiedCargo", () => {
  it("reads pieces shown with thousands separators", () => {
    expect(copiedCargo({ pcs: "1,353" }).colli).toBe(1353);
    expect(copiedCargo({ pcs: "12" }).colli).toBe(12);
  });

  it("reads a weight or volume with a decimal comma, keeping the kg to the gram", () => {
    expect(copiedCargo({ totalWeightTons: "4,2", totalVolumeCbm: "12,75" })).toEqual({ colli: 0, weightKg: 4200, measureCbm: 12.75 });
    expect(copiedCargo({ totalWeightTons: "1.2345" }).weightKg).toBe(1234.5);
  });

  // User council W3: a job declared only in its dimension lines came in as 0 kg / 0 cbm.
  const line = (pieces: string, l: string, w: string, h: string, kg: string, volumePerPcM3 = "") => ({ pieces, lengthCm: l, widthCm: w, heightCm: h, weightPerPcKg: kg, volumePerPcM3 });

  it("takes an empty Total Weight / Total Volume from the job's dimension lines, as Shipments declares it", () => {
    const sixPallets = [line("6", "120", "80", "125", "308.3333")];
    expect(copiedCargo({ pcs: "6", totalWeightTons: "", totalVolumeCbm: null, cargoDimensions: sixPallets })).toEqual({ colli: 6, weightKg: 1850, measureCbm: 7.2 });
    // A line without sizes counts its typed m³ per piece.
    expect(copiedCargo({ cargoDimensions: [line("2", "", "", "", "100", "0,5")] })).toMatchObject({ weightKg: 200, measureCbm: 1 });
  });

  it("takes empty Pcs from the dimension lines' pieces, as Shipments' declaredFigures does", () => {
    const lines = [line("4", "100", "100", "100", "50"), line("2", "", "", "", "10", "0.5")];
    expect(copiedCargo({ pcs: "", cargoDimensions: lines }).colli).toBe(6);
    // Typed Pcs wins over the lines.
    expect(copiedCargo({ pcs: "10", cargoDimensions: lines }).colli).toBe(10);
  });

  it("keeps the typed totals over the lines, field by field", () => {
    const lines = [line("2", "100", "100", "100", "50")];
    expect(copiedCargo({ totalWeightTons: "1.2", totalVolumeCbm: "", cargoDimensions: lines })).toMatchObject({ weightKg: 1200, measureCbm: 2 });
    expect(copiedCargo({ totalWeightTons: "", totalVolumeCbm: "3", cargoDimensions: lines })).toMatchObject({ weightKg: 100, measureCbm: 3 });
  });

  it("without dimension lines, takes the job's other line totals (shown with thousands separators)", () => {
    expect(copiedCargo({ totalGrossWeightKg: "21,500", totalVolumeM3: "58.08" })).toMatchObject({ weightKg: 21500, measureCbm: 58.08 });
    expect(copiedCargo({ totalWeightTons: "4", totalGrossWeightKg: "21,500" }).weightKg).toBe(4000);
  });

  it("gives 0 for what is missing or no number", () => {
    expect(copiedCargo({})).toEqual({ colli: 0, weightKg: 0, measureCbm: 0 });
    expect(copiedCargo({ pcs: "n/a", totalWeightTons: "", totalVolumeCbm: "-3" })).toEqual({ colli: 0, weightKg: 0, measureCbm: 0 });
  });
});
