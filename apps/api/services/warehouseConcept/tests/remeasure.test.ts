import { describe, expect, it } from "vitest";
import { remeasureTotals } from "../services/remeasure";

// Pure: no database. Runs with the warehouse tests (WAREHOUSE_DB_TESTS=1).

describe("remeasureTotals: the volume of a line", () => {
  // A House B/L read by Document Reading is saved as one line with the B/L's m³ per piece and no sizes.
  it("counts the m³ per piece of a line without sizes", () => {
    expect(remeasureTotals(JSON.stringify([{ pieces: "30", weightPerPcKg: "50", volumePerPcM3: "0.1166667" }]))).toEqual({ lines: 1, pieces: 30, weightKg: 1500, cbm: 3.5 });
    // Decimal comma, as the other fields.
    expect(remeasureTotals(JSON.stringify([{ pieces: "4", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "", volumePerPcM3: "0,25" }])).cbm).toBe(1);
  });

  it("works it out from the sizes when all three are measured, whatever m³ the line carries", () => {
    expect(remeasureTotals(JSON.stringify([{ pieces: "2", lengthCm: "100", widthCm: "100", heightCm: "100", weightPerPcKg: "", volumePerPcM3: "9" }])).cbm).toBe(2);
    // One size missing: the sizes do not count, the m³ per piece does.
    expect(remeasureTotals(JSON.stringify([{ pieces: "2", lengthCm: "100", widthCm: "100", heightCm: "", volumePerPcM3: "0.5" }])).cbm).toBe(1);
    expect(remeasureTotals(JSON.stringify([{ pieces: "2", lengthCm: "100", widthCm: "100", heightCm: "" }])).cbm).toBe(0);
  });

  it("refuses an m³ per piece that is not a plain non-negative number", () => {
    expect(() => remeasureTotals(JSON.stringify([{ pieces: "1", volumePerPcM3: "0.5 m3" }]))).toThrow(/Line 1: m³ per piece is not a number/);
    expect(() => remeasureTotals(JSON.stringify([{ pieces: "1", volumePerPcM3: -1 }]))).toThrow(/Line 1: m³ per piece is not valid/);
  });
});
