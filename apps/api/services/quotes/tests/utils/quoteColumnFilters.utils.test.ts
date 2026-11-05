import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));

import { columnFiltersOf } from "../../utils/quoteColumnFilters.utils";

const json = (rows: unknown) => JSON.stringify(rows);

describe("columnFiltersOf", () => {
  it("reads the rows, folded for the search, dropping those without a value", () => {
    expect(columnFiltersOf(json([{ key: "customer", value: " Alža " }, { key: "origin", value: "  " }, { key: "incoterm", value: "FOB" }]))).toEqual([
      { key: "customer", value: "alza", exact: false },
      { key: "incoterm", value: "fob", exact: true },
    ]);
  });

  it("takes % and _ as typed, not as patterns", () => {
    expect(columnFiltersOf(json([{ key: "commodity", value: "50%_x" }]))[0]?.value).toBe("50\\%\\_x");
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
