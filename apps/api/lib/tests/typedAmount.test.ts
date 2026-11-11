import { describe, expect, it } from "vitest";
import { parseTypedAmount } from "../typedAmount";

describe("parseTypedAmount", () => {
  it("reads English and Czech style alike", () => {
    expect(parseTypedAmount("12,500.00")).toBe(12500);
    expect(parseTypedAmount("12 500,50")).toBe(12500.5);
    expect(parseTypedAmount("1.250,50")).toBe(1250.5);
    expect(parseTypedAmount("1250.5")).toBe(1250.5);
  });

  it("takes a lone comma for thousands only in a figure written in threes", () => {
    expect(parseTypedAmount("2,000")).toBe(2000);
    expect(parseTypedAmount("1,250,000")).toBe(1250000);
    expect(parseTypedAmount("12,5")).toBe(12.5);
    expect(parseTypedAmount("0,50")).toBe(0.5);
  });

  it("is 0 for nothing and null for text that is no amount", () => {
    expect(parseTypedAmount("")).toBe(0);
    expect(parseTypedAmount(null)).toBe(0);
    expect(parseTypedAmount("approx. 5000")).toBeNull();
    expect(parseTypedAmount("1.2.3")).toBeNull();
    expect(parseTypedAmount("10.555")).toBeNull();
  });

  it("keeps a minus in front", () => {
    expect(parseTypedAmount("-1,250.00")).toBe(-1250);
  });
});
