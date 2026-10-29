import { describe, expect, it } from "vitest";
import { summarizeDimensions } from "./columnConfig";

describe("summarizeDimensions", () => {
  it("writes each line in the unit it was typed in", () => {
    const rows = [
      { pieces: "2", lengthCm: "120", widthCm: "80", heightCm: "100", weightPerPcKg: "" },
      { pieces: "", lengthCm: "111.76", widthCm: "102.87", heightCm: "25.4", weightPerPcKg: "", dimensionUnit: "in" },
    ];
    expect(summarizeDimensions(rows)).toBe("2× 120×80×100 cm, 1× 44×40.5×10 in");
  });
  it("leaves out lines without sizes", () => {
    expect(summarizeDimensions([{ pieces: "3", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "5" }])).toBe("");
  });
});
