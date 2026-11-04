import { describe, expect, it } from "vitest";
import { cargoNum, dimensionVolumePerPiece, hasAllSizes } from "../cargoVolume";

const piece = (over: Partial<Parameters<typeof dimensionVolumePerPiece>[0]> = {}) => ({ lengthCm: "", widthCm: "", heightCm: "", ...over });

describe("the volume of a piece (Shipments and the warehouse's e-mail)", () => {
  it("is worked out from the sizes once all three are known, whatever was typed", () => {
    expect(dimensionVolumePerPiece(piece({ lengthCm: "120", widthCm: "100", heightCm: "88" }))).toBeCloseTo(1.056, 6);
    expect(dimensionVolumePerPiece(piece({ lengthCm: "100", widthCm: "100", heightCm: "100", volumePerPcM3: "9" }))).toBe(1);
  });

  it("is the m³ typed for it while a size is missing", () => {
    expect(dimensionVolumePerPiece(piece({ volumePerPcM3: "0.75" }))).toBe(0.75);
    expect(dimensionVolumePerPiece(piece({ lengthCm: "120", widthCm: "80", volumePerPcM3: "0,5" }))).toBe(0.5);
    expect(dimensionVolumePerPiece(piece({ lengthCm: "120", widthCm: "80", heightCm: "0", volumePerPcM3: "0.5" }))).toBe(0.5);
    expect(dimensionVolumePerPiece(piece())).toBe(0);
    expect(dimensionVolumePerPiece(piece({ volumePerPcM3: null }))).toBe(0);
  });

  it("knows all three sizes only when each is above 0", () => {
    expect(hasAllSizes(piece({ lengthCm: "1", widthCm: "1", heightCm: "1" }))).toBe(true);
    expect(hasAllSizes(piece({ lengthCm: "1", widthCm: "1", heightCm: "-1" }))).toBe(false);
    expect(hasAllSizes(piece({ lengthCm: "1", widthCm: "1" }))).toBe(false);
  });

  it("reads a stored number as the shipment's totals do: a comma is a point, other characters left out", () => {
    expect(cargoNum("1,5")).toBe(1.5);
    expect(cargoNum(" 12 kg")).toBe(12);
    expect(cargoNum("abc")).toBe(0);
    expect(cargoNum(null)).toBe(0);
  });
});
