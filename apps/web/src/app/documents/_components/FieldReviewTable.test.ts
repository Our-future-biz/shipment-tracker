import { describe, expect, it } from "vitest";
import { readingFreightMode, seaportsFirst } from "./FieldReviewTable";
import type { ExtractedField } from "../_lib/extraction";

const field = (column: string, extractedValue: string, existingValue = "", approved = true): ExtractedField => ({
  column,
  extractedValue,
  existingValue,
  hasConflict: existingValue !== "" && existingValue !== extractedValue,
  approved,
});

// The POL / POD pickers of a document reading (review of user council step 3, minor 5; owner's answer Q3).
describe("readingFreightMode", () => {
  it("is the mode read when it is ticked", () => {
    expect(readingFreightMode([field("Freight Mode", "Sea Freight", "Air Freight")])).toBe("Sea Freight");
  });

  it("is the record's own mode when the one read is unticked or empty", () => {
    expect(readingFreightMode([field("Freight Mode", "Sea Freight", "Air Freight", false)])).toBe("Air Freight");
    expect(readingFreightMode([field("Freight Mode", "", "Sea FCL")])).toBe("Sea FCL");
  });

  it("is the mode read when the record has none, ticked or not", () => {
    expect(readingFreightMode([field("Freight Mode", "Sea Freight", "", false)])).toBe("Sea Freight");
  });

  it("is empty without a Freight Mode field (a master job's reading)", () => {
    expect(readingFreightMode([field("POL", "Hamburg (DEHAM)")])).toBe("");
  });
});

describe("seaportsFirst", () => {
  it("lists the seaports first in a sea reading's ports only", () => {
    expect(seaportsFirst("POL", "Sea Freight")).toBe(true);
    expect(seaportsFirst("POD", "Sea FCL")).toBe(true);
    expect(seaportsFirst("Origin", "Sea Freight")).toBe(false);
    expect(seaportsFirst("POD", "Air Freight")).toBe(false);
    expect(seaportsFirst("POD", "")).toBe(false);
  });
});
