import { describe, expect, it } from "vitest";
import { MAX_KG, typeKg } from "./keypad";

const typeAll = (keys: string[]) => keys.reduce((v, k) => typeKg(v, k), "");

describe("kg keypad", () => {
  it("types digits and one decimal", () => {
    expect(typeAll(["1", "2", "3", "4", ".", "5"])).toBe("1234.5");
    expect(typeAll(["1", ".", "5", "6"])).toBe("1.5");
    expect(typeAll(["1", ".", "."])).toBe("1.");
    expect(typeAll(["."])).toBe("0.");
    expect(typeAll(["0", "7"])).toBe("7");
  });
  it("deletes the last key and never goes above the limit", () => {
    expect(typeAll(["1", "2", "⌫"])).toBe("1");
    expect(typeKg("", "⌫")).toBe("");
    expect(typeKg(String(MAX_KG), "0")).toBe(String(MAX_KG));
    expect(typeKg("9999", "9")).toBe("99999");
    expect(typeKg("10000", "1")).toBe("10000");
    expect(typeKg("12", "x")).toBe("12");
  });
});
