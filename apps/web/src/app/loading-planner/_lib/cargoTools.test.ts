import { describe, expect, it } from "vitest";
import { newDraftLine, type DraftLine } from "./cargoForm";
import { boxCargoDiffers, boxVerdict, cargoDiffers, colourIndexes, duplicateLine, moveLine, pastedLines, resultWords, sheetNumber, shipmentsOf, STANDARD_UNITS, withStandardUnit } from "./cargoTools";

let n = 0;
const newId = () => `id${++n}`;
const line = (more: Partial<DraftLine> = {}): DraftLine => ({ ...newDraftLine(newId()), name: "Crate", lengthMm: 2000, widthMm: 1000, heightMm: 1000, weightKg: 500, colli: 2, ...more });

describe("standard units (Council Outlay 14, P5)", () => {
  it("fill a line's sizes, and its name only while it has none", () => {
    const eur = STANDARD_UNITS.find((u) => u.key === "eur")!;
    expect(withStandardUnit(newDraftLine("a"), eur)).toMatchObject({ name: "EUR pallet", lengthMm: 1200, widthMm: 800, heightMm: null, weightKg: null, colli: 1 });
    expect(withStandardUnit(line({ name: "Tools", heightMm: 1500 }), eur)).toMatchObject({ name: "Tools", lengthMm: 1200, widthMm: 800, heightMm: 1500, weightKg: 500 });
  });

  it("give a height only where the unit has one", () => {
    expect(withStandardUnit(newDraftLine("a"), STANDARD_UNITS.find((u) => u.key === "ibc")!)).toMatchObject({ name: "IBC", lengthMm: 1200, widthMm: 1000, heightMm: 1160 });
    expect(withStandardUnit(newDraftLine("a"), STANDARD_UNITS.find((u) => u.key === "drum")!)).toMatchObject({ name: "Drum 200 l", lengthMm: 585, widthMm: 585, heightMm: 880 });
  });
});

describe("copying and moving a line", () => {
  const [a, b, c] = [line({ id: "a" }), line({ id: "b", name: "B" }), line({ id: "c" })];
  it("copies a line right under it, with an id of its own", () => {
    const out = duplicateLine([a, b, c], "b", () => "new");
    expect(out.map((l) => l.id)).toEqual(["a", "b", "new", "c"]);
    expect(out[2]).toMatchObject({ name: "B", lengthMm: 2000 });
  });
  it("moves a line one place, and leaves the list alone at its ends", () => {
    expect(moveLine([a, b, c], "b", -1).map((l) => l.id)).toEqual(["b", "a", "c"]);
    expect(moveLine([a, b, c], "b", 1).map((l) => l.id)).toEqual(["a", "c", "b"]);
    expect(moveLine([a, b, c], "a", -1)).toEqual([a, b, c]);
    expect(moveLine([a, b, c], "c", 1)).toEqual([a, b, c]);
  });
});

describe("rows pasted from a spreadsheet", () => {
  it("reads a number the way a spreadsheet writes it", () => {
    expect(sheetNumber("1200")).toBe(1200);
    expect(sheetNumber("1 200")).toBe(1200);
    expect(sheetNumber("1,200")).toBe(1200);
    expect(sheetNumber("1200,5")).toBe(1200.5);
    expect(sheetNumber("1.200,5")).toBe(1200.5);
    expect(sheetNumber("1,200.5")).toBe(1200.5);
    expect(sheetNumber("12,5")).toBe(12.5);
    expect(sheetNumber("Pallet")).toBeNull();
    expect(sheetNumber("")).toBeNull();
  });

  it("takes name, length, width, height, weight and colli, in the unit of the table", () => {
    const lines = pastedLines("Cargo\tL\tW\tH\tkg\tColli\nPallet\t120\t80\t150\t450\t12\nCrate\t2,5\t1\t1\t1 200\t", "cm", newId)!;
    expect(lines.map((l) => [l.name, l.lengthMm, l.widthMm, l.heightMm, l.weightKg, l.colli])).toEqual([
      ["Pallet", 1200, 800, 1500, 450, 12],
      ["Crate", 25, 10, 10, 1200, 1],
    ]);
  });

  it("reads rows with no name, and keeps a row with figures missing as a line to finish", () => {
    const lines = pastedLines("1200\t800\t1500\t450\t4\r\n1200\t800\n", "mm", newId)!;
    expect(lines.map((l) => [l.name, l.lengthMm, l.widthMm, l.heightMm, l.weightKg, l.colli])).toEqual([
      ["", 1200, 800, 1500, 450, 4],
      ["", 1200, 800, null, null, 1],
    ]);
  });

  it("is no table for a plain word or a single figure: a paste into a cell stays a paste", () => {
    expect(pastedLines("Pallet", "mm", newId)).toBeNull();
    expect(pastedLines("1200", "mm", newId)).toBeNull();
    expect(pastedLines("Name\tLength\tWidth", "mm", newId)).toBeNull();
    expect(pastedLines("", "mm", newId)).toBeNull();
  });
});

describe("whether a plan's cargo is still the job's (P3)", () => {
  it("is the same whatever the order, the names and the ids", () => {
    const job = [line({ name: "Pallet" }), line({ name: "Crate", lengthMm: 3000 })];
    const plan = [line({ name: "Big crate", lengthMm: 3000, canTurn: false }), line({ name: "Pallets" }), newDraftLine("blank")];
    expect(cargoDiffers(plan, job)).toBe(false);
  });

  it("differs when a size, a weight, the colli or a line changed", () => {
    const job = [line(), line({ lengthMm: 3000 })];
    expect(cargoDiffers([line(), line({ lengthMm: 3100 })], job)).toBe(true);
    expect(cargoDiffers([line({ weightKg: 600 }), line({ lengthMm: 3000 })], job)).toBe(true);
    expect(cargoDiffers([line({ colli: 3 }), line({ lengthMm: 3000 })], job)).toBe(true);
    expect(cargoDiffers([line()], job)).toBe(true);
    expect(cargoDiffers([], [])).toBe(false);
  });
});

describe("a plan of a sailing's box (Council Outlay 14, C1)", () => {
  const lines = [{ id: "a", group: "CZ1" }, { id: "b", group: "CZ2" }, { id: "c", group: "CZ1" }, { id: "d" }, { id: "e" }];

  it("colours a line by its row, or by its shipment so a shipment's pieces share one colour", () => {
    expect([...colourIndexes(lines, false).values()]).toEqual([0, 1, 2, 3, 4]);
    expect([...colourIndexes(lines, true).entries()]).toEqual([["a", 0], ["b", 1], ["c", 0], ["d", 2], ["e", 3]]);
    expect(shipmentsOf(lines)).toEqual(["CZ1", "CZ2"]);
  });

  it("says what a plan came to, for the lists", () => {
    expect(resultWords({ equipment: [{ name: "40' HC", count: 2 }, { name: "20' FR", count: 1 }], notLoaded: 3 })).toBe("2 × 40' HC + 1 × 20' FR · 3 colli not loaded");
    expect(resultWords({ equipment: [{ name: "40' HC", count: 1 }], notLoaded: 0 })).toBe("1 × 40' HC");
    expect(resultWords({ equipment: [], notLoaded: 0 })).toBe("");
    expect(resultWords(null)).toBe("");
  });

  it("says when the cargo needs more than the sailing has", () => {
    const hc = { container: { name: "40' HC" } };
    const sailing = { containerType: "40' HC", containerCount: 1 };
    expect(boxVerdict([hc], 0, sailing)).toBeNull();
    expect(boxVerdict([], 0, sailing)).toBeNull();
    expect(boxVerdict([hc, hc], 0, sailing)).toBe("The cargo needs 2 × 40' HC; the sailing has 1 × 40' HC.");
    expect(boxVerdict([hc], 4, sailing)).toBe("4 colli found no place in the sailing's 1 × 40' HC.");
    expect(boxVerdict([{ container: { name: "40' FR" } }], 0, sailing)).toMatch(/^This plan uses other equipment than the sailing's 1 × 40' HC/);
    expect(boxVerdict([hc, hc], 0, { containerType: "40' HC", containerCount: 2 })).toBeNull();
  });
});

describe("a box plan against its sailing's cargo", () => {
  const draft = (id: string, group: string, over: Partial<DraftLine> = {}): DraftLine => ({ ...newDraftLine(id), name: group, lengthMm: 1200, widthMm: 800, heightMm: 1000, weightKg: 300, colli: 2, group, ...over });
  const job = [draft("a", "CZ1"), draft("b", "CZ2", { lengthMm: null, widthMm: null, heightMm: null })];

  it("does not mind sizes typed for a shipment that has none", () => {
    expect(boxCargoDiffers(job, job)).toBe(false);
    expect(boxCargoDiffers([job[0]!, draft("b", "CZ2", { lengthMm: 500, widthMm: 400, heightMm: 300 })], job)).toBe(false);
  });

  it("says when a shipment joined or left, or a sized shipment's lines changed", () => {
    expect(boxCargoDiffers([job[0]!], job)).toBe(true);
    expect(boxCargoDiffers([...job, draft("c", "CZ3")], job)).toBe(true);
    expect(boxCargoDiffers([draft("a", "CZ1", { colli: 3 }), job[1]!], job)).toBe(true);
  });
});
