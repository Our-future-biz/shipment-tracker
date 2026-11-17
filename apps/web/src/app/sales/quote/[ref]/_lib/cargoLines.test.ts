import { describe, expect, it } from "vitest";
import { containerLineName, lineFigure, packageLineName, withLineCopied, withoutLine } from "./cargoLines";

describe("withLineCopied", () => {
  it("puts a copy of the line right after it, the other lines where they were", () => {
    const lines = [{ qty: 1, type: "20' DC" }, { qty: 2, type: "40' HC", weight: 18000 }, { qty: 1, type: "40' RF" }];
    const copied = withLineCopied(lines, 1);
    expect(copied).toEqual([lines[0], lines[1], { qty: 2, type: "40' HC", weight: 18000 }, lines[2]]);
    // A line of its own: changing the copy leaves the original as it is.
    expect(copied[2]).not.toBe(lines[1]);
    expect(lines).toHaveLength(3);
  });

  it("copies nothing for a line that is not there", () => {
    const lines = [{ qty: 1, type: "Pallets" }];
    expect(withLineCopied(lines, 3)).toEqual(lines);
  });
});

describe("withoutLine", () => {
  it("takes the one line out and keeps the order of the rest", () => {
    expect(withoutLine(["a", "b", "c"], 1)).toEqual(["a", "c"]);
    expect(withoutLine(["a"], 0)).toEqual([]);
  });
});

describe("how a line reads", () => {
  it("shows a figure the way quantities are shown, and nothing for one never entered", () => {
    expect(lineFigure(18500)).toBe("18,500");
    expect(lineFigure(1.25)).toBe("1.25");
    expect(lineFigure(0)).toBe("0");
    expect(lineFigure(undefined)).toBe("");
    expect(lineFigure(Number.NaN)).toBe("");
  });

  it("names a line for its delete confirmation: count and type, a box saved under an old name as it is called today", () => {
    expect(containerLineName({ qty: 2, type: "40' HC" })).toBe("2 × 40' HC");
    expect(containerLineName({ qty: 1, type: "40' GP" })).toBe("1 × 40' DC");
    expect(packageLineName({ qty: 3, type: "Pallets" })).toBe("3 × Pallets");
    expect(packageLineName({ qty: 1, type: "" })).toBe("1 × package");
  });
});
