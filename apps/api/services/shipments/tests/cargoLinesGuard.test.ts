import { describe, expect, it } from "vitest";
import { sameCargoLines } from "../lib/cargoLinesGuard";
import type { CargoDimensionLine } from "../interfaces/interfaces";

const line = (over: Partial<CargoDimensionLine> = {}): CargoDimensionLine => ({
  containerId: "c1",
  pieces: "4",
  lengthCm: "120",
  widthCm: "80",
  heightCm: "150",
  dimensionUnit: "cm",
  weightPerPcKg: "34",
  volumePerPcM3: "",
  packageType: "Pallet(s)",
  stackable: "",
  palletType: null,
  adrUn: null,
  adrClass: null,
  adrPackingGroup: null,
  adrLimitedQuantity: false,
  ...over,
});

// Mock test council Y10: a page's line save is held to the lines it started from.
describe("sameCargoLines", () => {
  it("finds the same lines however their numbers and ADR fields are written", () => {
    expect(sameCargoLines([line({ weightPerPcKg: "1,5", adrUn: "UN 1203", palletType: "epal" as never })], [line({ weightPerPcKg: "1.50", adrUn: "1203", palletType: "EPAL" as never })], 1)).toBe(true);
    // A typed volume beside all three sizes is not kept, so it is not compared.
    expect(sameCargoLines([line({ volumePerPcM3: "9" })], [line()], 1)).toBe(true);
    expect(sameCargoLines([], [], 0)).toBe(true);
  });

  it("finds an accepted remeasurement, a changed line, another order or another number of lines", () => {
    expect(sameCargoLines([line()], [line({ lengthCm: "140" })], 1)).toBe(false);
    expect(sameCargoLines([line()], [line({ adrUn: "1993" })], 1)).toBe(false);
    expect(sameCargoLines([line({ pieces: "1" }), line()], [line(), line({ pieces: "1" })], 1)).toBe(false);
    expect(sameCargoLines([line()], [line(), line()], 1)).toBe(false);
    expect(sameCargoLines([line({ lengthCm: "", volumePerPcM3: "0.5" })], [line({ lengthCm: "", volumePerPcM3: "0.6" })], 1)).toBe(false);
  });

  it("compares the containers only when there are several: with one every line is its", () => {
    expect(sameCargoLines([line({ containerId: null })], [line({ containerId: "c1" })], 1)).toBe(true);
    expect(sameCargoLines([line({ containerId: "c2" })], [line({ containerId: "c1" })], 2)).toBe(false);
  });
});
