import { describe, expect, it } from "vitest";
import { MAIN_SEARCH_DEFAULT_LIMIT, MAIN_SEARCH_MAX_LIMIT, mainSearchInput } from "../mainSearch";

describe("mainSearchInput", () => {
  it("does not search fewer than two characters, spaces aside", () => {
    expect(mainSearchInput("", undefined)).toBeNull();
    expect(mainSearchInput(undefined, undefined)).toBeNull();
    expect(mainSearchInput("a", 10)).toBeNull();
    expect(mainSearchInput("  a  ", 10)).toBeNull();
    expect(mainSearchInput("   ", 10)).toBeNull();
  });

  it("counts a letter with its accent as one character", () => {
    expect(mainSearchInput("š", undefined)).toBeNull();
    expect(mainSearchInput("šá", undefined)).toEqual({ q: "šá", limit: MAIN_SEARCH_DEFAULT_LIMIT });
  });

  it("searches the trimmed text, five rows when no limit is given", () => {
    expect(mainSearchInput("  ab ", undefined)).toEqual({ q: "ab", limit: 5 });
    expect(MAIN_SEARCH_DEFAULT_LIMIT).toBe(5);
  });

  it("keeps the limit between 1 and 50, in whole rows", () => {
    expect(mainSearchInput("ab", 0)?.limit).toBe(1);
    expect(mainSearchInput("ab", -3)?.limit).toBe(1);
    expect(mainSearchInput("ab", 12)?.limit).toBe(12);
    expect(mainSearchInput("ab", 7.8)?.limit).toBe(7);
    expect(mainSearchInput("ab", 500)?.limit).toBe(MAIN_SEARCH_MAX_LIMIT);
    expect(mainSearchInput("ab", Number.NaN)?.limit).toBe(5);
  });
});
