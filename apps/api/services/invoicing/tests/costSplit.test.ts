import { describe, expect, it } from "vitest";
import { splitAmount, splitCents } from "../lib/costSplit";

const sum = (parts: string[]) => parts.reduce((a, p) => a + Math.round(Number(p) * 100), 0);

describe("splitAmount", () => {
  it("splits 100.00 three ways to the cent: the cent left over goes to the first part", () => {
    expect(splitAmount("100.00", [1, 1, 1])).toEqual(["33.34", "33.33", "33.33"]);
  });

  it("gives the cents left over to the parts that lost the most in rounding", () => {
    // exact: 16.666.., 33.333.., 50.00 - the 1/6 part lost 0.67 of a cent, the 1/3 part 0.33
    expect(splitAmount("100.00", [1, 2, 3])).toEqual(["16.67", "33.33", "50.00"]);
    expect(splitAmount("10.00", [0.333, 0.333, 0.334])).toEqual(["3.33", "3.33", "3.34"]);
  });

  it("gives a part of weight 0 nothing and the rest to the others", () => {
    expect(splitAmount("100.00", [0, 2.5, 0, 2.5])).toEqual(["0.00", "50.00", "0.00", "50.00"]);
    expect(splitAmount("0.01", [0, 1, 1])).toEqual(["0.00", "0.01", "0.00"]);
  });

  it("always adds up to the total", () => {
    const weights = [1.234, 0.5, 7.25, 3.333, 0, 12.01, 0.001];
    for (const total of ["0.01", "1.00", "99.99", "1234.57", "1000000.03"]) {
      expect(sum(splitAmount(total, weights))).toBe(Math.round(Number(total) * 100));
    }
  });

  it("splits a negative total (a credit) as its positive, turned back", () => {
    expect(splitAmount("-100.00", [1, 1, 1])).toEqual(["-33.34", "-33.33", "-33.33"]);
  });

  it("refuses weights it cannot split by", () => {
    expect(() => splitCents(100, [0, 0])).toThrow();
    expect(() => splitCents(100, [])).toThrow();
    expect(() => splitCents(100, [1, -1])).toThrow();
    expect(() => splitCents(100, [1, Number.NaN])).toThrow();
    expect(() => splitCents(1.5, [1])).toThrow();
  });
});
