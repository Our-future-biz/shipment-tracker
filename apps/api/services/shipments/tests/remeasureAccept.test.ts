import { describe, expect, it } from "vitest";
import {
  ACCEPT_BY_HAND,
  ALREADY_ACCEPTED,
  acceptByHandRefusal,
  acceptRefusal,
  alreadyAccepted,
  acceptedContainerFigures,
  acceptedDimensionLines,
  acceptedLinesOf,
  acceptedTotals,
  exactFiguresOf,
  figuresOf,
  parseRemeasuredLines,
  readFigures,
  roundedFigures,
  sameCargoDetails,
  sameRemeasuredLines,
} from "../lib/remeasureAccept";
import type { CargoDimensionLine, ContainerLine } from "../interfaces/interfaces";

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
    expect(parseRemeasuredLines(JSON.stringify([{ pieces: "2", lengthCm: "10,5", widthCm: "20", heightCm: "30", weightPerPcKg: "1,5" }]))).toEqual([
      { pieces: "2", lengthCm: "10.5", widthCm: "20", heightCm: "30", weightPerPcKg: "1.5" },
    ]);
  });

  it("leaves out lines without pieces, which need no figures", () => {
    expect(parseRemeasuredLines(JSON.stringify([{ pieces: "", lengthCm: "10" }, { pieces: "1", lengthCm: "10", widthCm: "10", heightCm: "10", weightPerPcKg: "1" }]))).toHaveLength(1);
  });

  it("refuses a line with pieces whose weight or sizes are not measured, naming the line, so no empty weight or volume is written over the shipment's", () => {
    const full = { pieces: "5", lengthCm: "140", widthCm: "220", heightCm: "225", weightPerPcKg: "50" };
    const rule = "the warehouse must measure weight and sizes of every line before it can be accepted";
    expect(() => parseRemeasuredLines(JSON.stringify([full, { ...full, weightPerPcKg: "" }]))).toThrow(`Remeasured line 2 has no kg per piece: ${rule}`);
    expect(() => parseRemeasuredLines(JSON.stringify([{ ...full, heightCm: "" }]))).toThrow(`Remeasured line 1 has no height: ${rule}`);
    // A missing field and a 0 alike; the number is the line's in the warehouse's list, lines without pieces counted.
    expect(() => parseRemeasuredLines(JSON.stringify([{ pieces: "" }, { pieces: "3", lengthCm: "0", weightPerPcKg: "10" }]))).toThrow(`Remeasured line 2 has no length, width or height: ${rule}`);
    expect(() => parseRemeasuredLines(JSON.stringify([{ pieces: "3" }]))).toThrow(`Remeasured line 1 has no kg per piece, length, width or height: ${rule}`);
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

  it("rounds the exact totals once: the weight to 0.1 kg as compared, the volume to its 4th decimal", () => {
    // 7 × 13.25 kg = 92.75 kg.
    const exact = exactFiguresOf(parseRemeasuredLines(JSON.stringify([{ pieces: "7", lengthCm: "10", widthCm: "10", heightCm: "10", weightPerPcKg: "13.25" }])));
    expect(exact.weightKg).toBe(92.75);
    expect(acceptedTotals(exact).totalWeightTons).toBe("0.0928");
    expect(roundedFigures(exact).weightKg).toBe(92.8);
    // Not first to 0.001 (1.235): the volume keeps its 4th decimal.
    expect(acceptedTotals({ colli: 3, weightKg: 1, volumeCbm: 1.23456 }).totalVolumeCbm).toBe("1.2346");
  });
});

describe("acceptedContainerFigures", () => {
  it("gives the only container the exact totals, no trailing zeros", () => {
    expect(acceptedContainerFigures({ colli: 7, weightKg: 92.75, volumeCbm: 0.007 })).toEqual({ packages: "7", grossWeight: "92.75", volume: "0.007" });
    expect(acceptedContainerFigures({ colli: 0, weightKg: 0, volumeCbm: 0 })).toEqual({ packages: "", grossWeight: "", volume: "" });
  });
});

// Council finding X2: line n keeps the shipment's line n's container, packing and dangerous goods.
describe("acceptByHandRefusal", () => {
  const general = { ...declared, adrUn: null, adrClass: null, adrPackingGroup: null, pieces: "4" };
  const un1993 = { ...general, pieces: "1", adrUn: "1993", adrClass: "3" };

  it("refuses another number of lines when dangerous goods are on the lines, so a UN number neither vanishes nor moves", () => {
    expect(acceptByHandRefusal(1, [general, un1993])).toBe(ACCEPT_BY_HAND);
    expect(acceptByHandRefusal(3, [general, un1993])).toBe(ACCEPT_BY_HAND);
    expect(acceptByHandRefusal(2, [general, un1993])).toBeNull();
  });

  it("refuses another number of lines on several containers, so no line falls into the first", () => {
    expect(acceptByHandRefusal(3, [general, { ...general, containerId: "c2" }])).toBe(ACCEPT_BY_HAND);
    expect(acceptByHandRefusal(2, [general, { ...general, containerId: "c2" }])).toBeNull();
  });

  it("lets general cargo of one container, or none, take another number of lines", () => {
    expect(acceptByHandRefusal(3, [general])).toBeNull();
    expect(acceptByHandRefusal(1, [general, { ...general, containerId: null }])).toBeNull();
    expect(acceptByHandRefusal(2, [])).toBeNull();
  });
});

// Council finding m7: "120." and ".5" are numbers on both sides.
describe("a figure typed with a point at its end or start", () => {
  it("is read and stored tidy", () => {
    expect(parseRemeasuredLines(JSON.stringify([{ pieces: "2", lengthCm: "120.", widthCm: ".5", heightCm: "10", weightPerPcKg: "1," }]))).toEqual([
      { pieces: "2", lengthCm: "120", widthCm: "0.5", heightCm: "10", weightPerPcKg: "1" },
    ]);
    expect(() => parseRemeasuredLines(JSON.stringify([{ pieces: "2", lengthCm: "1.2.3" }]))).toThrow("Remeasured line 1: length is not a number");
    expect(() => parseRemeasuredLines(JSON.stringify([{ pieces: "2", lengthCm: "." }]))).toThrow("Remeasured line 1: length is not a number");
  });
});

// Council finding m8: the same lines are not accepted twice.
describe("the lines an acceptance took over", () => {
  it("are read from its history entry, and the same lines are found however they were saved", () => {
    expect(acceptedLinesOf(JSON.stringify({ colli: 5, lines: saved }))).toBe(saved);
    expect(acceptedLinesOf(JSON.stringify({ colli: 5 }))).toBe("");
    expect(acceptedLinesOf("null")).toBe("");
    expect(sameRemeasuredLines(saved, JSON.stringify([{ weightPerPcKg: "50", pieces: " 5", lengthCm: "140.", widthCm: "220", heightCm: "225" }]))).toBe(true);
    expect(sameRemeasuredLines(saved, JSON.stringify([{ pieces: "6", lengthCm: "140", widthCm: "220", heightCm: "225", weightPerPcKg: "50" }]))).toBe(false);
    expect(sameRemeasuredLines("", saved)).toBe(false);
  });
});

describe("readFigures", () => {
  it("reads a history entry's figures, zeros when it can't", () => {
    expect(readFigures(JSON.stringify({ colli: 5, weightKg: 250, volumeCbm: 34.65, lines: "[]" }))).toEqual({ colli: 5, weightKg: 250, volumeCbm: 34.65 });
    expect(readFigures("nonsense")).toEqual({ colli: 0, weightKg: 0, volumeCbm: 0 });
    expect(readFigures(null)).toEqual({ colli: 0, weightKg: 0, volumeCbm: 0 });
  });
});

// Review: two Accepts at once, or one after the lines were accepted, record one acceptance - asked
// before the write and again in its write turn, on the history as it is then.
describe("acceptRefusal", () => {
  const general = { ...declared, adrUn: null, adrClass: null, adrPackingGroup: null };
  const accepted = (lines: string) => JSON.stringify({ colli: 5, weightKg: 250, volumeCbm: 34.65, lines });

  it("refuses the lines the last acceptance took over, also saved again with other spacing", () => {
    expect(acceptRefusal(saved, 1, accepted(saved), [general])).toBe(ALREADY_ACCEPTED);
    expect(acceptRefusal(saved, 1, accepted(JSON.stringify([{ pieces: " 5 ", lengthCm: "140", widthCm: "220", heightCm: "225", weightPerPcKg: "50" }])), [general])).toBe(ALREADY_ACCEPTED);
  });

  it("lets new lines through, and lines when nothing was accepted or the entry names no lines", () => {
    const other = JSON.stringify([{ pieces: "6", lengthCm: "100", widthCm: "100", heightCm: "100", weightPerPcKg: "40" }]);
    expect(acceptRefusal(saved, 1, accepted(other), [general])).toBeNull();
    expect(acceptRefusal(saved, 1, null, [general])).toBeNull();
    expect(acceptRefusal(saved, 1, "{}", [general])).toBeNull();
  });

  it("alreadyAccepted says the first half alone: what the write turn asks before anything else", () => {
    expect(alreadyAccepted(saved, accepted(saved))).toBe(true);
    expect(alreadyAccepted(saved, null)).toBe(false);
    expect(alreadyAccepted(saved, accepted("[]"))).toBe(false);
  });

  it("then asks whether the lines must be updated by hand", () => {
    expect(acceptRefusal(saved, 1, null, [general, declared])).toBe(ACCEPT_BY_HAND);
    // Already accepted says more: nothing new to accept at all.
    expect(acceptRefusal(saved, 1, accepted(saved), [general, declared])).toBe(ALREADY_ACCEPTED);
  });
});

// Review: an acceptance is decided on Cargo Details as read before its write turn; a save in
// between makes it be looked at again rather than undo the save.
describe("sameCargoDetails", () => {
  const box: ContainerLine = { id: "c1", containerNumber: "MSKU1234567", sealNumber: "S1", type: "40' HC", teu: "2", packages: "5", packageType: "Cartons", grossWeight: "170", volume: "7.2" };
  const read = { containers: [box], lines: [declared] };

  it("holds for the same rows, whatever order their keys were built in", () => {
    const reordered = Object.fromEntries(Object.entries(box).reverse()) as unknown as ContainerLine;
    expect(sameCargoDetails(read, { containers: [reordered], lines: [{ ...declared }] })).toBe(true);
  });

  it("fails for a container added or removed, a changed seal or figure", () => {
    expect(sameCargoDetails(read, { containers: [box, { ...box, id: "c2" }], lines: [declared] })).toBe(false);
    expect(sameCargoDetails(read, { containers: [], lines: [declared] })).toBe(false);
    expect(sameCargoDetails(read, { containers: [{ ...box, sealNumber: "S2" }], lines: [declared] })).toBe(false);
    expect(sameCargoDetails(read, { containers: [{ ...box, grossWeight: "180" }], lines: [declared] })).toBe(false);
  });

  it("fails for a line added, removed, reordered or given other dangerous goods", () => {
    const second = { ...declared, pieces: "1", adrUn: "1993" };
    expect(sameCargoDetails(read, { containers: [box], lines: [declared, second] })).toBe(false);
    expect(sameCargoDetails(read, { containers: [box], lines: [] })).toBe(false);
    expect(sameCargoDetails({ containers: [box], lines: [declared, second] }, { containers: [box], lines: [second, declared] })).toBe(false);
    expect(sameCargoDetails(read, { containers: [box], lines: [{ ...declared, adrClass: "8" }] })).toBe(false);
    // A value cleared to null is a change too.
    expect(sameCargoDetails(read, { containers: [box], lines: [{ ...declared, adrUn: null }] })).toBe(false);
  });
});
