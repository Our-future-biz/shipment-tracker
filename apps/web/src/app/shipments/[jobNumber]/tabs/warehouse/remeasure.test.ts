import { describe, expect, it } from "vitest";
import { diffText, figuresCompared, figuresDiffer } from "./RemeasureCompare";
import type { CargoDimensionLine } from "@/lib/cargo";
import {
  ACCEPT_BY_HAND,
  ALREADY_ACCEPTED,
  acceptByHandReason,
  descriptionNote,
  figuresText,
  keptText,
  readRemeasuredLines,
  remeasuredFigures,
  roundedFigures,
  sameRemeasuredLines,
  shipmentCargoFigures,
  tidyNumber,
  unmeasuredReason,
} from "./remeasuredLines";

// CZAIR00000094: Cargo Details 5 × 120×80×150 cm, 170 kg; the warehouse 5 × 140×220×225 cm, 50 kg each.
const saved = JSON.stringify([{ pieces: "5", lengthCm: "140", widthCm: "220", heightCm: "225", weightPerPcKg: "50" }]);
const ship = { colli: 5, weightKg: 170, volumeCbm: 7.2 };

describe("readRemeasuredLines", () => {
  it("reads the saved lines with pieces", () => {
    expect(readRemeasuredLines(saved)).toEqual([{ pieces: "5", lengthCm: "140", widthCm: "220", heightCm: "225", weightPerPcKg: "50" }]);
    expect(readRemeasuredLines(JSON.stringify([{ pieces: "", lengthCm: "1" }, { pieces: 2, lengthCm: 10 }]))).toEqual([
      { pieces: "2", lengthCm: "10", widthCm: "", heightCm: "", weightPerPcKg: "" },
    ]);
  });

  it("reads nothing from text that is not a list", () => {
    expect(readRemeasuredLines(undefined)).toEqual([]);
    expect(readRemeasuredLines("{")).toEqual([]);
    expect(readRemeasuredLines('{"a":1}')).toEqual([]);
    expect(readRemeasuredLines("[null, 3]")).toEqual([]);
  });
});

describe("unmeasuredReason", () => {
  const full = { pieces: "5", lengthCm: "140", widthCm: "220", heightCm: "225", weightPerPcKg: "50" };
  const rule = "the warehouse must measure weight and sizes of every line before it can be accepted";

  it("lets lines measured in full be accepted, lines without pieces needing no figures", () => {
    expect(unmeasuredReason(saved)).toBeNull();
    expect(unmeasuredReason(JSON.stringify([{ pieces: "", lengthCm: "1" }, { ...full, weightPerPcKg: "1,5" }]))).toBeNull();
    expect(unmeasuredReason(undefined)).toBeNull();
  });

  it("names the first line with pieces that lacks its weight or a size, numbered as in the warehouse's list", () => {
    expect(unmeasuredReason(JSON.stringify([full, { ...full, weightPerPcKg: "" }]))).toBe(`Remeasured line 2 has no kg per piece: ${rule}`);
    expect(unmeasuredReason(JSON.stringify([{ pieces: "" }, { pieces: 3, lengthCm: "0", weightPerPcKg: 10 }]))).toBe(`Remeasured line 2 has no length, width or height: ${rule}`);
    expect(unmeasuredReason(JSON.stringify([{ pieces: "3" }]))).toBe(`Remeasured line 1 has no kg per piece, length, width or height: ${rule}`);
  });
});

describe("remeasuredFigures", () => {
  it("adds pieces, kg and m³, a decimal comma read as a point", () => {
    expect(remeasuredFigures(readRemeasuredLines(saved))).toEqual({ colli: 5, weightKg: 250, volumeCbm: 34.65 });
    expect(remeasuredFigures(readRemeasuredLines(JSON.stringify([{ pieces: "2", lengthCm: "50,5", widthCm: "100", heightCm: "100", weightPerPcKg: "1,25" }])))).toEqual({
      colli: 2,
      weightKg: 2.5,
      volumeCbm: 1.01,
    });
  });
});

describe("the comparison", () => {
  it("marks a difference only where both figures are known", () => {
    const re = remeasuredFigures(readRemeasuredLines(saved));
    expect(figuresDiffer(ship, re)).toBe(true);
    expect(figuresDiffer(ship, { ...ship })).toBe(false);
    expect(figuresDiffer({ colli: 0, weightKg: 0, volumeCbm: 0 }, re)).toBe(false);
    expect(figuresCompared({ colli: 0, weightKg: 0, volumeCbm: 0 }, re)).toBe(false);
    expect(figuresCompared(ship, re)).toBe(true);
  });

  it("writes the difference with its sign", () => {
    expect(diffText(250, 170, 1)).toBe("+80.0");
    expect(diffText(34.65, 7.2, 3)).toBe("+27.450");
    expect(diffText(5775, 1200, 1)).toBe("+4,575.0");
    expect(diffText(4, 5, 0)).toBe("−1");
    expect(diffText(5, 5, 0)).toBe("0");
    expect(diffText(0, 5, 0)).toBe("—");
    expect(diffText(7.2004, 7.2, 3)).toBe("0");
    expect(diffText(7.2016, 7.2, 3)).toBe("+0.002");
  });

  it("says the figures in a line", () => {
    expect(figuresText({ colli: 5, weightKg: 250, volumeCbm: 34.65 })).toBe("5 colli · 250.0 kg · 34.650 CBM");
    expect(figuresText({ colli: 0, weightKg: 0, volumeCbm: 0 })).toBe("— colli · — kg · — CBM");
  });
});

const dim = (over: Partial<CargoDimensionLine> = {}): CargoDimensionLine => ({
  containerId: "c1",
  pieces: "4",
  lengthCm: "120",
  widthCm: "80",
  heightCm: "150",
  weightPerPcKg: "34",
  volumePerPcM3: "",
  packageType: "Pallet(s)",
  stackable: "",
  ...over,
});

// Council findings X10 and N1: both sides rounded alike, a figure the lines lack from the shipment's totals.
describe("the shipment's figures the remeasurement is held against", () => {
  it("round the lines' totals as the remeasured ones: 7 × 13.25 kg is the 92.8 kg accepted", () => {
    const seven = { pieces: "7", lengthCm: "100", widthCm: "100", heightCm: "100", weightPerPcKg: "13.25" };
    const ours = shipmentCargoFigures({ cargoDimensions: [dim(seven)] });
    expect(ours).toEqual({ colli: 7, weightKg: 92.8, volumeCbm: 7 });
    expect(figuresDiffer(ours, remeasuredFigures(readRemeasuredLines(JSON.stringify([seven]))))).toBe(false);
  });

  it("take a figure the lines lack from Pcs, Total Weight or Total Volume, so a heavier remeasurement differs", () => {
    const ours = shipmentCargoFigures({ cargoDimensions: [dim({ pieces: "2", weightPerPcKg: "" })], pcs: "2", totalWeightTons: "0.45", totalVolumeCbm: "" });
    expect(ours).toEqual({ colli: 2, weightKg: 450, volumeCbm: 2.88 });
    expect(figuresDiffer(ours, { colli: 2, weightKg: 600, volumeCbm: 2.88 })).toBe(true);
    expect(roundedFigures({ colli: 1, weightKg: 92.75, volumeCbm: 1.23449 })).toEqual({ colli: 1, weightKg: 92.8, volumeCbm: 1.234 });
  });
});

// Council finding X2: line n keeps the shipment's line n's container, packing and dangerous goods.
describe("acceptByHandReason", () => {
  it("refuses another number of lines on dangerous goods or several containers, as the server does", () => {
    const un1993 = dim({ pieces: "1", adrUn: "1993", adrClass: "3" });
    expect(acceptByHandReason(1, [dim(), un1993])).toBe(ACCEPT_BY_HAND);
    expect(acceptByHandReason(3, [dim(), dim({ containerId: "c2" })])).toBe(ACCEPT_BY_HAND);
    expect(acceptByHandReason(2, [dim(), un1993])).toBeNull();
    expect(acceptByHandReason(3, [dim()])).toBeNull();
  });

  it("says what the lines keep, never more than is true", () => {
    expect(keptText(1, [dim()])).toBe("Each line keeps the package type, stackability and pallet type of the line in its place here.");
    expect(keptText(2, [dim({ adrUn: "1993" }), dim()])).toBe("Each line keeps the package type, stackability, pallet type and dangerous goods of the line in its place here.");
    expect(keptText(3, [dim()])).toContain("the extra lines take those of the first line");
    expect(keptText(1, [dim(), dim()])).toContain("the lines after line 1 are removed");
    expect(keptText(1, [])).toContain("no lines to keep");
  });
});

// Council finding X3: the description lines are never changed; when their pieces differ, it is said.
describe("descriptionNote", () => {
  const item = (pieces: string, packageType = "Cartons") => ({ containerId: null, cargoDescription: "Shoes", hsCode: "", pieces, packageType, grossWeight: "", commercialInvoiceValue: "", currency: "" });

  it("says what the description lines still say, nothing when they agree or carry no pieces", () => {
    expect(descriptionNote([item("12"), item("8")], 7)).toBe("Description lines still say 20 Cartons");
    expect(descriptionNote([item("20")], 20)).toBeNull();
    expect(descriptionNote([item("")], 7)).toBeNull();
  });
});

// Council finding m7: "120." and ".5" are numbers here as on the server.
describe("a figure typed with a point at its end or start", () => {
  it("is tidied for saving, and Accept is ready for it as the server is", () => {
    expect(tidyNumber("120.")).toBe("120");
    expect(tidyNumber(".5")).toBe("0.5");
    expect(tidyNumber(" 1,5 ")).toBe("1.5");
    expect(tidyNumber("abc")).toBe("abc");
    expect(unmeasuredReason(JSON.stringify([{ pieces: "5", lengthCm: "120.", widthCm: ".5", heightCm: "10", weightPerPcKg: "2" }]))).toBeNull();
  });

  it("refuses what the server refuses, in its words", () => {
    expect(unmeasuredReason(JSON.stringify([{ pieces: "5", lengthCm: "1.2.3", widthCm: "1", heightCm: "1", weightPerPcKg: "1" }]))).toBe("Remeasured line 1: length is not a number");
    expect(unmeasuredReason(JSON.stringify([{ pieces: "1.5", lengthCm: "1", widthCm: "1", heightCm: "1", weightPerPcKg: "1" }]))).toBe("Remeasured line 1: Qty must be a whole number");
  });
});

// Council finding m8: the lines the last acceptance took over are not accepted again.
describe("sameRemeasuredLines", () => {
  it("finds the same lines however they were saved", () => {
    expect(sameRemeasuredLines(saved, JSON.stringify([{ weightPerPcKg: "50", pieces: " 5", lengthCm: "140.", widthCm: "220", heightCm: "225" }]))).toBe(true);
    expect(sameRemeasuredLines(saved, JSON.stringify([{ pieces: "6", lengthCm: "140", widthCm: "220", heightCm: "225", weightPerPcKg: "50" }]))).toBe(false);
    expect(sameRemeasuredLines("", saved)).toBe(false);
    expect(ALREADY_ACCEPTED).toBe("These remeasured lines were already accepted: the warehouse has saved nothing new since");
  });
});
