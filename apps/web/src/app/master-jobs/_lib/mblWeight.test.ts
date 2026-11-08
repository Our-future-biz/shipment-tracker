import { describe, expect, it } from "vitest";
import { kgFromTons, tonsFromKg } from "./mblWeight";

describe("the MBL's total weight in kg", () => {
  it("shows the kept tons as kg", () => {
    expect(kgFromTons("5")).toBe("5000");
    expect(kgFromTons("1.2505")).toBe("1250.5");
    expect(kgFromTons("5,2")).toBe("5200");
    expect(kgFromTons(" 0.75 ")).toBe("750");
  });

  it("shows nothing for nothing, and text that is no number as it is", () => {
    expect(kgFromTons("")).toBe("");
    expect(kgFromTons(null)).toBe("");
    expect(kgFromTons("approx 5")).toBe("approx 5");
  });

  it("keeps typed kg as tons, as people write numbers", () => {
    expect(tonsFromKg("1000")).toBe("1");
    expect(tonsFromKg("1 250,5")).toBe("1.2505");
    expect(tonsFromKg("12.34")).toBe("0.01234");
  });

  it("clears with empty text and refuses what is no weight", () => {
    expect(tonsFromKg("")).toBe("");
    expect(tonsFromKg("  ")).toBe("");
    expect(tonsFromKg("abc")).toBeNull();
    expect(tonsFromKg("-5")).toBeNull();
  });

  it("shows typed kg back unchanged", () => {
    for (const kg of ["1250.55", "0.01", "18450", "999999.99"]) {
      expect(kgFromTons(tonsFromKg(kg))).toBe(kg);
    }
  });
});
