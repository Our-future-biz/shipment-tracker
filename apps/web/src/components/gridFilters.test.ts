import { describe, expect, it } from "vitest";
import { activeGridFilters, matchesGridFilters, newFilterId, storedGridFilters, withFilterId } from "./gridFilters";

describe("grid filters", () => {
  it("gives every row its own id", () => {
    const a = withFilterId({ key: "city", value: "x" });
    const b = withFilterId({ key: "city", value: "x" });
    expect(a.id).not.toBe(b.id);
    expect(newFilterId()).not.toBe(newFilterId());
  });

  it("only rows with a column and a value filter; stored ones are trimmed without ids", () => {
    const rows = [
      { id: "1", key: "city", value: " Praha " },
      { id: "2", key: "", value: "x" },
      { id: "3", key: "country", value: "  " },
    ];
    expect(activeGridFilters(rows).map((f) => f.id)).toEqual(["1"]);
    expect(storedGridFilters(rows)).toEqual([{ key: "city", value: "Praha" }]);
  });

  it("matches every filter, any case, contains", () => {
    const row = { city: "Praha 7", country: "CZ" };
    const text = (r: typeof row, key: string) => r[key as keyof typeof row] ?? "";
    expect(matchesGridFilters(row, [{ key: "city", value: "praha" }, { key: "country", value: "cz" }], text)).toBe(true);
    expect(matchesGridFilters(row, [{ key: "city", value: "praha" }, { key: "city", value: "brno" }], text)).toBe(false);
  });
});
