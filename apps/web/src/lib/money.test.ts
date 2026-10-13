import { describe, expect, it } from "vitest";
import { money, moneyCz, num, parseMoney, round2, sumRounded } from "./money";

describe("num", () => {
  it.each([
    ["1250", 1250],
    ["1250.50", 1250.5],
    ["1250,50", 1250.5],
    ["1 250,50", 1250.5],
    ["1 250,50", 1250.5],
    ["1,250.50", 1250.5],
    ["1.250,50", 1250.5],
    ["-500", -500],
    ["-1,5", -1.5],
    ["EUR 99,90", 99.9],
  ])("reads %j as %d", (input, expected) => {
    expect(num(input)).toBe(expected);
  });

  it("gives 0 for empty or non-numeric input", () => {
    expect(num("")).toBe(0);
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num("abc")).toBe(0);
    expect(num(NaN)).toBe(0);
    expect(num(Infinity)).toBe(0);
  });

  it("passes finite numbers through", () => {
    expect(num(12.34)).toBe(12.34);
  });
});

describe("parseMoney", () => {
  it.each([
    ["", 0],
    ["  ", 0],
    ["1250", 1250],
    ["1 250,50", 1250.5],
    ["1.250,50", 1250.5],
    ["1,250.50", 1250.5],
    ["-500,5", -500.5],
  ])("accepts %j as %d", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each(["abc", "12a", "1,234", "1.2.3", "1,005", "--5", "1e5"])("rejects %j", (input) => {
    // "1,234" is ambiguous (thousands or decimal?) and has 3 decimals, so it is rejected
    expect(parseMoney(input)).toBeNull();
  });
});

describe("round2", () => {
  it("rounds half away from zero despite binary noise", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.004)).toBe(1);
  });

  it("gives 0 for non-finite values", () => {
    expect(round2(NaN)).toBe(0);
    expect(round2(Infinity)).toBe(0);
  });
});

describe("sumRounded", () => {
  it("equals the sum of the rounded lines", () => {
    // unrounded these sum to 3.015 -> 3.02, but the printed lines are 1.01 + 1.01 + 1.01 = 3.03
    expect(sumRounded([1.005, 1.005, 1.005])).toBe(3.03);
  });

  it("handles negative lines (discounts)", () => {
    expect(sumRounded([1000, -250.5])).toBe(749.5);
  });
});

describe("formatting", () => {
  it("money is English style", () => {
    expect(money(1234.5)).toBe("1,234.50");
    expect(money(NaN)).toBe("0.00");
  });

  it("moneyCz is Czech style", () => {
    // Intl uses a non-breaking space as the thousands separator
    expect(moneyCz(1234567.891).replace(/\s/g, " ")).toBe("1 234 567,89");
    expect(moneyCz(-0.5)).toBe("-0,50");
  });
});
