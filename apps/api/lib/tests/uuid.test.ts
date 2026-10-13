import { describe, expect, it } from "vitest";
import { isUuid } from "../uuid";

describe("isUuid", () => {
  it("accepts an id as the database hands it out, in either case", () => {
    expect(isUuid("7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01")).toBe(true);
    expect(isUuid("7B0E4D53-08A5-4E5E-9A0B-0E2F6A1F1C01")).toBe(true);
  });

  it("refuses anything else", () => {
    const others = [
      "",
      "abc",
      "CZ00000101",
      "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c0",
      "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c011",
      "7b0e4d5308a54e5e9a0b0e2f6a1f1c01",
      "zb0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01",
      " 7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01",
      "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01\n",
    ];
    for (const value of others) expect(isUuid(value), JSON.stringify(value)).toBe(false);
  });
});
