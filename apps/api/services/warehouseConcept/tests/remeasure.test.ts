import { describe, expect, it } from "vitest";
import { remeasureTotals } from "../services/remeasure";

// Pure: no database. Runs with the warehouse tests (WAREHOUSE_DB_TESTS=1).

describe("remeasureTotals: the volume of a line", () => {
  it("works it out from the pieces and their three sizes", () => {
    expect(remeasureTotals(JSON.stringify([{ pieces: "2", lengthCm: "100", widthCm: "100", heightCm: "100", weightPerPcKg: "50" }]))).toEqual({ lines: 1, pieces: 2, weightKg: 100, cbm: 2 });
    // Decimal comma, as the warehouse may type it.
    expect(remeasureTotals(JSON.stringify([{ pieces: "4", lengthCm: "50", widthCm: "50", heightCm: "100", weightPerPcKg: "2,5" }])).weightKg).toBe(10);
  });

  it("gives no volume to a line that lacks a size", () => {
    expect(remeasureTotals(JSON.stringify([{ pieces: "2", lengthCm: "100", widthCm: "100", heightCm: "" }])).cbm).toBe(0);
  });
});
