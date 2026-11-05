import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));

import { columnFiltersOf } from "../../utils/quoteColumnFilters.utils";

const json = (rows: unknown) => JSON.stringify(rows);

describe("columnFiltersOf", () => {
  it("reads the rows, folded for the search, dropping those without a value", () => {
    expect(columnFiltersOf(json([{ key: "customer", value: " Alža " }, { key: "origin", value: "  " }, { key: "incoterm", value: "FOB" }]))).toEqual([
      { key: "customer", value: "alza", exact: false, text: "alza" },
      { key: "incoterm", value: "fob", exact: true, text: "fob" },
    ]);
  });

  it("takes % and _ as typed, not as patterns", () => {
    const [filter] = columnFiltersOf(json([{ key: "commodity", value: "50%_x" }]));
    expect(filter?.value).toBe("50\\%\\_x");
    // Unescaped for another service, which escapes it its own way.
    expect(filter?.text).toBe("50%_x");
  });

  it("is nothing without filters", () => {
    expect(columnFiltersOf(undefined)).toEqual([]);
    expect(columnFiltersOf("")).toEqual([]);
    expect(columnFiltersOf("[]")).toEqual([]);
  });

  it("refuses what is no list of known columns", () => {
    for (const bad of ["{", "{}", json([{ key: "data", value: "x" }]), json([{ key: "customer", value: 3 }])]) {
      expect(() => columnFiltersOf(bad)).toThrow(expect.objectContaining({ code: "invalid_argument" }));
    }
    expect(() => columnFiltersOf(json(Array.from({ length: 11 }, () => ({ key: "customer", value: "a" }))))).toThrow(expect.objectContaining({ code: "invalid_argument" }));
  });
});
