import { describe, expect, it } from "vitest";
import { diffText, figuresCompared, figuresDiffer } from "./RemeasureCompare";
import { figuresText, readRemeasuredLines, remeasuredFigures, unmeasuredReason } from "./remeasuredLines";

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
