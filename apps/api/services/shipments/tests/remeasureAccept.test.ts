import { describe, expect, it } from "vitest";
import { alreadyAccepted, acceptedLinesOf, exactFiguresOf, figuresOf, parseRemeasuredLines, readFigures, roundedFigures, sameRemeasuredFigures, sameRemeasuredLines } from "../lib/remeasureAccept";
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

// The history entry's "after" figures: rounded once, as they are compared and shown everywhere.
describe("roundedFigures", () => {
  it("rounds the exact figures once: the weight to 0.1 kg, the volume to 0.001 m³", () => {
    // 7 × 13.25 kg = 92.75 kg.
    const exact = exactFiguresOf(parseRemeasuredLines(JSON.stringify([{ pieces: "7", lengthCm: "10", widthCm: "10", heightCm: "10", weightPerPcKg: "13.25" }])));
    expect(exact.weightKg).toBe(92.75);
    expect(roundedFigures(exact).weightKg).toBe(92.8);
    // Mock test council n13: lines of 1.23449 m³ are 1.234 at the 3 decimals Cargo Details compares.
    expect(roundedFigures({ colli: 3, weightKg: 1, volumeCbm: 1.23449 }).volumeCbm).toBe(1.234);
    expect(roundedFigures({ colli: 3, weightKg: 1, volumeCbm: 1.23456 }).volumeCbm).toBe(1.235);
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
describe("the lines an acceptance accepted", () => {
  it("are read from its history entry, and the same lines are found however they were saved", () => {
    expect(acceptedLinesOf(JSON.stringify({ colli: 5, lines: saved }))).toBe(saved);
    expect(acceptedLinesOf(JSON.stringify({ colli: 5 }))).toBe("");
    expect(acceptedLinesOf("null")).toBe("");
    expect(sameRemeasuredLines(saved, JSON.stringify([{ weightPerPcKg: "50", pieces: " 5", lengthCm: "140.", widthCm: "220", heightCm: "225" }]))).toBe(true);
    expect(sameRemeasuredLines(saved, JSON.stringify([{ pieces: "6", lengthCm: "140", widthCm: "220", heightCm: "225", weightPerPcKg: "50" }]))).toBe(false);
    expect(sameRemeasuredLines("", saved)).toBe(false);
  });
});

// Review of system-23: an Inform Operations' entry keeps the figures it told, not the lines - held against
// the figures an acceptance took, an Inform Again of the lines last accepted is no difference left to accept.
describe("sameRemeasuredFigures", () => {
  const told = { colli: 5, weightKg: 250, volumeCbm: 34.65 };

  it("holds for the same pieces, kg and m³ as they are compared - kg to 0.1, m³ to 0.001", () => {
    expect(sameRemeasuredFigures(told, { ...told })).toBe(true);
    expect(sameRemeasuredFigures(told, { colli: 5, weightKg: 250.04, volumeCbm: 34.6504 })).toBe(true);
  });

  it("does not hold for any other figure, or when neither says anything", () => {
    expect(sameRemeasuredFigures(told, { ...told, colli: 6 })).toBe(false);
    expect(sameRemeasuredFigures(told, { ...told, weightKg: 250.1 })).toBe(false);
    expect(sameRemeasuredFigures(told, { ...told, volumeCbm: 0 })).toBe(false);
    expect(sameRemeasuredFigures({ colli: 0, weightKg: 0, volumeCbm: 0 }, { colli: 0, weightKg: 0, volumeCbm: 0 })).toBe(false);
  });
});

describe("readFigures", () => {
  it("reads a history entry's figures, zeros when it can't", () => {
    expect(readFigures(JSON.stringify({ colli: 5, weightKg: 250, volumeCbm: 34.65, lines: "[]" }))).toEqual({ colli: 5, weightKg: 250, volumeCbm: 34.65 });
    expect(readFigures("nonsense")).toEqual({ colli: 0, weightKg: 0, volumeCbm: 0 });
    expect(readFigures(null)).toEqual({ colli: 0, weightKg: 0, volumeCbm: 0 });
  });
});

// Council finding m8, owner's answer 22 Nov: an acceptance is only recorded, so "already accepted"
// is the history alone - the last acceptance's lines are the lines the warehouse has saved. Two
// Accepts at once, or one after the lines were accepted, record one acceptance: asked before the
// write and again in its write turn.
describe("alreadyAccepted", () => {
  const accepted = (lines: string) => JSON.stringify({ colli: 5, weightKg: 250, volumeCbm: 34.65, lines });

  it("holds when the last acceptance accepted the same lines, also saved with other spacing or key order", () => {
    expect(alreadyAccepted(saved, accepted(saved))).toBe(true);
    expect(alreadyAccepted(saved, accepted(JSON.stringify([{ weightPerPcKg: "50", pieces: " 5 ", lengthCm: "140.", widthCm: "220", heightCm: "225" }])))).toBe(true);
  });

  it("does not hold for other lines - the warehouse saved something new since", () => {
    const other = JSON.stringify([{ pieces: "6", lengthCm: "100", widthCm: "100", heightCm: "100", weightPerPcKg: "40" }]);
    expect(alreadyAccepted(saved, accepted(other))).toBe(false);
    expect(alreadyAccepted(saved, accepted("[]"))).toBe(false);
  });

  it("does not hold when nothing was accepted, or the entry names no lines", () => {
    expect(alreadyAccepted(saved, null)).toBe(false);
    expect(alreadyAccepted(saved, undefined)).toBe(false);
    expect(alreadyAccepted(saved, "{}")).toBe(false);
  });
});
