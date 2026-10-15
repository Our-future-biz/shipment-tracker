import { describe, expect, it } from "vitest";
import { formatNumber } from "./number";

describe("formatNumber", () => {
  it("separates thousands with a space and keeps the decimals asked for", () => {
    expect(formatNumber(1234567.891, 2)).toBe("1 234 567.89");
    expect(formatNumber(12)).toBe("12");
  });

  it("shows a missing value as asked", () => {
    expect(formatNumber(null)).toBe("");
    expect(formatNumber(undefined, 0, "—")).toBe("—");
    expect(formatNumber(0, 0, "—")).toBe("0");
  });
});
