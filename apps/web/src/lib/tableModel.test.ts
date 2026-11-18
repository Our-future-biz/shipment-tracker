import { describe, expect, it } from "vitest";
import { CHECK_KEY, checkOf, knownFilters, matchesTableFilters, normalizeColumns, shownColumns, tableModel } from "./tableModel";

// The shared rules on a small table of their own; Accounts Payable's tables are tested in its payableColumns.test.ts.

type Row = { name: string; status: string; late: boolean; big: boolean };

const TABLE = tableModel<Row, "late" | "big">({
  scope: "test-table",
  columns: [
    { key: "name", title: "Name" },
    { key: "status", title: "Status", options: ["Open", "Closed"] },
    { key: "note", title: "Note" },
  ],
  first: "name",
  checks: [
    { key: "late", label: "Late", tip: "" },
    { key: "big", label: "Big ones", tip: "" },
  ],
  checksTitle: "Show only",
  cellText: (r, key) => (key === "name" ? r.name : key === "status" ? r.status : ""),
  passesCheck: (r, check) => (check === "late" ? r.late : r.big),
});

const row = (over: Partial<Row> = {}): Row => ({ name: "Škoda Auto", status: "Open", late: false, big: false, ...over });
const check = (value: string) => ({ key: CHECK_KEY, value });

describe("a table's model", () => {
  it("shows every column at first and offers the checks first in the Filter panel", () => {
    expect(TABLE.view).toEqual({ scope: "test-table", defaults: ["name", "status", "note"] });
    expect(TABLE.filterColumns[0]).toEqual({ key: CHECK_KEY, title: "Show only", options: ["Late", "Big ones"] });
    expect(TABLE.filterColumns.slice(1).map((c) => c.key)).toEqual(["name", "status", "note"]);
  });

  it("finds a check by its words, case and spaces aside", () => {
    expect(checkOf(TABLE, " big ONES ")?.key).toBe("big");
    expect(checkOf(TABLE, "Something old")).toBeUndefined();
  });
});

describe("the Filter panel", () => {
  it("keeps the rows every check holds for", () => {
    expect(matchesTableFilters(TABLE, row({ late: true }), [check("Late")])).toBe(true);
    expect(matchesTableFilters(TABLE, row(), [check("late")])).toBe(false);
    expect(matchesTableFilters(TABLE, row({ late: true }), [check("Late"), check("Big ones")])).toBe(false);
  });

  it("matches a column's text (contains, diacritics aside) and a column with options exactly", () => {
    expect(matchesTableFilters(TABLE, row(), [{ key: "name", value: "skoda" }])).toBe(true);
    expect(matchesTableFilters(TABLE, row(), [{ key: "status", value: "Open" }])).toBe(true);
    expect(matchesTableFilters(TABLE, row(), [{ key: "status", value: "Op" }])).toBe(false);
  });

  it("ignores a saved check since renamed, and drops it and unknown columns from a saved set", () => {
    expect(matchesTableFilters(TABLE, row(), [check("Something old")])).toBe(true);
    expect(knownFilters(TABLE, [check("Something old"), check("Late"), { key: "gone", value: "x" }, { key: "name", value: "CZ" }])).toEqual([check("Late"), { key: "name", value: "CZ" }]);
  });
});

describe("Columns", () => {
  it("shows the known columns in table order, the first always among them", () => {
    expect(normalizeColumns(TABLE, ["note", "status", "nope", "status"])).toEqual(["name", "status", "note"]);
    expect(normalizeColumns(TABLE, null)).toEqual(["name"]);
    expect(shownColumns([{ key: "supplier" }, { key: "jobs" }, { key: "due" }], ["due", "supplier"])).toEqual([{ key: "supplier" }, { key: "due" }]);
  });
});
