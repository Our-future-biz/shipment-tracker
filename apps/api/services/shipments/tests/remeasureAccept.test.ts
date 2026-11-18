import { describe, expect, it } from "vitest";
import { acceptedDimensionLines, acceptedTotals, figuresOf, parseRemeasuredLines, readFigures } from "../lib/remeasureAccept";
import type { CargoDimensionLine } from "../interfaces/interfaces";

// CZAIR00000094: declared 5 cartons 120×80×150 cm, 34 kg each; the warehouse found 5 × 140×220×225 cm, 50 kg each.
const declared: CargoDimensionLine = {
  containerId: "c1",
  pieces: "5",
  lengthCm: "120",
  widthCm: "80",
  heightCm: "150",
  dimensionUnit: "cm",
  weightPerPcKg: "34",
  volumePerPcM3: "",
  packageType: "Cartons",
  stackable: "Stackable / Overstowable",
  palletType: null,
  adrUn: "1203",
  adrClass: "3",
  adrPackingGroup: "II",
  adrLimitedQuantity: false,
};
const saved = JSON.stringify([{ pieces: "5", lengthCm: "140", widthCm: "220", heightCm: "225", weightPerPcKg: "50" }]);

describe("parseRemeasuredLines", () => {
  it("reads the saved lines, a decimal comma as a point", () => {
    expect(parseRemeasuredLines(JSON.stringify([{ pieces: "2", lengthCm: "10,5", widthCm: "20", heightCm: "30", weightPerPcKg: "" }]))).toEqual([
      { pieces: "2", lengthCm: "10.5", widthCm: "20", heightCm: "30", weightPerPcKg: "" },
    ]);
  });

  it("leaves out lines without pieces", () => {
    expect(parseRemeasuredLines(JSON.stringify([{ pieces: "", lengthCm: "10" }, { pieces: "1", lengthCm: "10" }]))).toHaveLength(1);
  });

  it("refuses nothing to accept, unreadable text and a figure that is not a number", () => {
    expect(() => parseRemeasuredLines("")).toThrow(/nothing to accept/);
    expect(() => parseRemeasuredLines("[]")).toThrow(/nothing to accept/);
    expect(() => parseRemeasuredLines("{")).toThrow(/cannot be read/);
    expect(() => parseRemeasuredLines(JSON.stringify([{ pieces: "2", lengthCm: "abc" }]))).toThrow("Remeasured line 1: length is not a number");
    expect(() => parseRemeasuredLines(JSON.stringify([{ pieces: "1.5" }]))).toThrow("Remeasured line 1: Qty must be a whole number");
  });
});

describe("figuresOf", () => {
  it("adds pieces, kg and m³ as the Warehouse tab does", () => {
    expect(figuresOf(parseRemeasuredLines(saved))).toEqual({ colli: 5, weightKg: 250, volumeCbm: 34.65 });
    expect(figuresOf([declared])).toEqual({ colli: 5, weightKg: 170, volumeCbm: 7.2 });
  });

  it("takes a line's typed m³ when its sizes are not all known", () => {
    expect(figuresOf([{ ...declared, lengthCm: "", volumePerPcM3: "0.5" }]).volumeCbm).toBe(2.5);
  });
});

describe("acceptedDimensionLines", () => {
  it("takes the measured figures and keeps what the warehouse does not measure", () => {
    const [line] = acceptedDimensionLines(parseRemeasuredLines(saved), [declared]);
    expect(line).toEqual({
      ...declared,
      lengthCm: "140",
      widthCm: "220",
      heightCm: "225",
      weightPerPcKg: "50",
    });
  });

  it("gives extra lines the first line's package type, and works without any line", () => {
    const two = parseRemeasuredLines(JSON.stringify([{ pieces: "1", lengthCm: "10", widthCm: "10", heightCm: "10", weightPerPcKg: "1" }, { pieces: "2", lengthCm: "20", widthCm: "20", heightCm: "20", weightPerPcKg: "2" }]));
    expect(acceptedDimensionLines(two, [declared]).map((l) => l.packageType)).toEqual(["Cartons", "Cartons"]);
    const [bare] = acceptedDimensionLines(two, []);
    expect(bare).toMatchObject({ containerId: null, packageType: "", stackable: "", adrUn: null, dimensionUnit: "cm", volumePerPcM3: "" });
  });

  it("sizes typed in inches are replaced by the measured cm", () => {
    const [line] = acceptedDimensionLines(parseRemeasuredLines(saved), [{ ...declared, dimensionUnit: "in" }]);
    expect(line!.dimensionUnit).toBe("cm");
  });
});

describe("acceptedTotals", () => {
  it("stores Pcs, tons and m³ as the shipment keeps them", () => {
    expect(acceptedTotals({ colli: 5, weightKg: 250, volumeCbm: 34.65 })).toEqual({ pcs: "5", totalWeightTons: "0.2500", totalVolumeCbm: "34.6500" });
    expect(acceptedTotals({ colli: 3, weightKg: 0, volumeCbm: 0 })).toEqual({ pcs: "3", totalWeightTons: null, totalVolumeCbm: null });
  });
});

describe("readFigures", () => {
  it("reads a history entry's figures, zeros when it can't", () => {
    expect(readFigures(JSON.stringify({ colli: 5, weightKg: 250, volumeCbm: 34.65, lines: "[]" }))).toEqual({ colli: 5, weightKg: 250, volumeCbm: 34.65 });
    expect(readFigures("nonsense")).toEqual({ colli: 0, weightKg: 0, volumeCbm: 0 });
    expect(readFigures(null)).toEqual({ colli: 0, weightKg: 0, volumeCbm: 0 });
  });
});
