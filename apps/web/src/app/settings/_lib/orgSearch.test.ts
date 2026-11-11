import { describe, expect, it } from "vitest";
import { matchesSearch } from "./orgSearch";

describe("the Organization page's search", () => {
  it("ignores case and accents, the stroked letters' too", () => {
    expect(matchesSearch("plzen", "Plzeň")).toBe(true);
    expect(matchesSearch("lodz", "Branch Łódź")).toBe(true);
    expect(matchesSearch("Gdansk", "Gdańsk")).toBe(true);
    expect(matchesSearch("brno", "Ostrava")).toBe(false);
  });
});
