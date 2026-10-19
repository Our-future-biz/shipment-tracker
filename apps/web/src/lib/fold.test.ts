import { describe, expect, it } from "vitest";
import { fold, foldIncludes } from "./fold";

describe("fold", () => {
  it("drops diacritics and case, stroked letters included", () => {
    expect(fold("Železný Brod, ŠKODA Plzeň — Łódź")).toBe("zelezny brod, skoda plzen — lodz");
  });

  it("finds a name typed without its accents, and with them", () => {
    expect(foldIncludes("Železný s.r.o.", "zelezny")).toBe(true);
    expect(foldIncludes("Zelezny s.r.o.", " Železný ")).toBe(true);
    expect(foldIncludes("Novák", "nowak")).toBe(false);
  });
});
