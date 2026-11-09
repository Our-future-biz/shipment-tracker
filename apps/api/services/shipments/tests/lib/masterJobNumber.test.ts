import { describe, expect, it } from "vitest";
import { masterJobLetters, masterJobNumberDigits, masterJobNumberFor, masterJobNumberForms } from "../../lib/masterJobNumber";

describe("a master job's reference", () => {
  it("takes its letters from the Load Type", () => {
    expect(masterJobLetters("Consolidation")).toBe("CONSOL");
    expect(masterJobLetters("Full Load")).toBe("FULL");
    expect(masterJobLetters("Project Shipment")).toBe("PROJECT");
  });

  it("has none while there is no Load Type", () => {
    expect(masterJobLetters("")).toBe("");
    expect(masterJobLetters(null)).toBe("");
    expect(masterJobNumberFor("MCZ00000008", "")).toBe("MCZ00000008");
  });

  it("keeps the number when it gets its letters", () => {
    expect(masterJobNumberFor("MCZ00000007", "Consolidation")).toBe("MCZCONSOL00000007");
    expect(masterJobNumberFor("MCZ00000006", "Full Load")).toBe("MCZFULL00000006");
    expect(masterJobNumberFor("MCZ00000004", "Project Shipment")).toBe("MCZPROJECT00000004");
  });

  it("does not double letters it already has, and leaves other text alone", () => {
    expect(masterJobNumberFor("MCZCONSOL00000007", "Consolidation")).toBe("MCZCONSOL00000007");
    expect(masterJobNumberFor("OLD-7", "Consolidation")).toBe("OLD-7");
  });

  it("reads the number with or without letters", () => {
    expect(masterJobNumberDigits("MCZ00000007")).toBe("00000007");
    expect(masterJobNumberDigits("MCZPROJECT00000004")).toBe("00000004");
    expect(masterJobNumberDigits("CZFCL00000004")).toBeNull();
    expect(masterJobNumberDigits("MCZLCL00000004")).toBeNull();
  });

  it("names every form the same number can be stored in", () => {
    expect(masterJobNumberForms("MCZ00000007").sort()).toEqual(["MCZ00000007", "MCZCONSOL00000007", "MCZFULL00000007", "MCZPROJECT00000007"]);
    expect(masterJobNumberForms("MCZCONSOL00000007")).toContain("MCZ00000007");
    expect(masterJobNumberForms("OLD-7")).toEqual(["OLD-7"]);
  });
});
