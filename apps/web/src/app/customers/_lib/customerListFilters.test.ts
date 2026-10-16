import { describe, expect, it } from "vitest";
import { filtersFromSearchParams, writeFiltersToSearchParams } from "./customerListFilters";
import { normalizeCustomerColumns, NAME_COLUMN_KEY, CUSTOMER_COLUMN_MAP } from "./customerListColumns";

const known = (key: string) => CUSTOMER_COLUMN_MAP.has(key);

describe("customer list filters in the URL", () => {
  it("keeps two filters on the same column through a round trip", () => {
    const params = writeFiltersToSearchParams(new URLSearchParams("q=acme&f.city=old"), [
      { key: "city", value: "Praha" },
      { key: "city", value: "Brno" },
      { key: "country", value: "CZ" },
    ]);
    expect(params.get("q")).toBe("acme");
    expect(params.getAll("f.city")).toEqual(["Praha", "Brno"]);
    expect(filtersFromSearchParams(params, known)).toEqual([
      { key: "city", value: "Praha" },
      { key: "city", value: "Brno" },
      { key: "country", value: "CZ" },
    ]);
  });

  it("drops filters on columns the list no longer has, and blank ones", () => {
    const params = new URLSearchParams("f.city=Praha&f.registryStatus=active&f.country=");
    expect(filtersFromSearchParams(params, known)).toEqual([{ key: "city", value: "Praha" }]);
  });
});

describe("normalizeCustomerColumns", () => {
  it("puts the name first, keeps known keys once in order", () => {
    expect(normalizeCustomerColumns(["city", "nope", NAME_COLUMN_KEY, "city", "country"])).toEqual([NAME_COLUMN_KEY, "city", "country"]);
  });

  it("always shows the name, even for an empty list", () => {
    expect(normalizeCustomerColumns([])).toEqual([NAME_COLUMN_KEY]);
  });
});
