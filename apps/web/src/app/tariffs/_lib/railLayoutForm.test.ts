import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { cleanLayout, columnHeadings, columnOptions, findingRowsText, layoutProblems, letterIndex, newBand, sheetColumnOptions } from "./railLayoutForm";

const PREVIEW: interfaces.SheetPreview = {
  name: "26Road",
  rowCount: 100,
  rows: [
    { rowNo: 1, cells: { A: "Rail/Road Price List 2026" } },
    { rowNo: 18, cells: { A: "Country", B: "PLZ", C: "Destination", D: "Via/Depot", E: "20' 0<14 t", F: "20'<25 t", L: "Notice" } },
    { rowNo: 19, cells: { A: "CZ", B: "36235", C: "Abertamy", D: "Usti/Usti", E: "746", F: "866", M: "2026-01-01" } },
  ],
};

const LAYOUT: interfaces.RailLayout = {
  sheet: "26Road",
  headerRow: 18,
  firstDataRow: 19,
  lastDataRow: null,
  columns: { country: "A", postcode: "B", place: "C", region: null, via: "D", emptyDepot: "D", note: "L", validFrom: null, validTo: null },
  bands: [{ column: "E", label: "20' 0<14 t", minLengthFt: 20, maxLengthFt: 20, maxGrossTonnes: 14 }],
  currency: "EUR",
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  defaultCountry: "CZ",
  conditions: ["All-in rate"],
  links: [],
  name: "Hamburg – Czechia",
};

describe("letterIndex", () => {
  it("counts columns like a spreadsheet", () => {
    expect(letterIndex("A")).toBe(1);
    expect(letterIndex("Z")).toBe(26);
    expect(letterIndex("AA")).toBe(27);
    expect(letterIndex("ab")).toBe(28);
  });
});

describe("columnHeadings", () => {
  it("names every column of the preview after its heading, in sheet order", () => {
    const headings = columnHeadings(PREVIEW, 18);
    expect([...headings.keys()]).toEqual(["A", "B", "C", "D", "E", "F", "L", "M"]);
    expect(headings.get("D")).toBe("Via/Depot");
    // A column with values but no heading is still offered, without a name.
    expect(headings.get("M")).toBe("");
  });

  it("is empty without a preview", () => {
    expect(columnHeadings(null, 18).size).toBe(0);
  });
});

describe("columnOptions", () => {
  it("labels columns with their headings and keeps columns the layout names but the preview lacks", () => {
    const options = columnOptions(columnHeadings(PREVIEW, 18), { ...LAYOUT, columns: { ...LAYOUT.columns, region: "O" } });
    expect(options.find((o) => o.value === "D")?.label).toBe("D — Via/Depot");
    expect(options.find((o) => o.value === "M")?.label).toBe("M");
    expect(options.at(-1)).toEqual({ value: "O", label: "O" });
  });
});

describe("sheetColumnOptions", () => {
  it("names a sheet's columns after its headings row and keeps letters the layout names", () => {
    const options = sheetColumnOptions([PREVIEW], "26Road", 18, ["E", null, "AB"]);
    expect(options.find((o) => o.value === "C")?.label).toBe("C — Destination");
    expect(options.at(-1)).toEqual({ value: "AB", label: "AB" });
  });

  it("offers only the named letters for a sheet the file lacks", () => {
    expect(sheetColumnOptions([PREVIEW], "Other", 1, ["B"])).toEqual([{ value: "B", label: "B" }]);
  });
});

describe("newBand", () => {
  it("takes the next column right of the last price column, named after its heading", () => {
    expect(newBand(LAYOUT, columnHeadings(PREVIEW, 18))).toEqual({ column: "F", label: "20'<25 t", minLengthFt: 20, maxLengthFt: 20, maxGrossTonnes: null });
  });
});

describe("cleanLayout", () => {
  it("trims text and drops empty lines", () => {
    const clean = cleanLayout({
      ...LAYOUT,
      currency: " eur ",
      conditions: ["All-in rate ", "", "  "],
      links: [{ label: "", url: "" }, { label: " Surcharges", url: "https://example.com " }],
    });
    expect(clean.currency).toBe("EUR");
    expect(clean.conditions).toEqual(["All-in rate"]);
    expect(clean.links).toEqual([{ label: "Surcharges", url: "https://example.com" }]);
  });
});

describe("layoutProblems", () => {
  it("is empty for a layout that can be sent", () => {
    expect(layoutProblems(LAYOUT)).toEqual([]);
  });

  it("refuses a last price row above the first, and two price columns read the same", () => {
    expect(layoutProblems({ ...LAYOUT, lastDataRow: 5 })).toContain("The last price row comes before the first");
    expect(layoutProblems({ ...LAYOUT, bands: [LAYOUT.bands[0]!, { ...LAYOUT.bands[0]!, column: "Z" }] })).toEqual(["Two price columns have the same lengths and weight"]);
  });

  it("names what is missing or wrong", () => {
    const problems = layoutProblems({
      ...LAYOUT,
      firstDataRow: 18,
      bands: [
        { ...LAYOUT.bands[0]!, minLengthFt: 30, maxLengthFt: 20 },
        { ...LAYOUT.bands[0]!, label: "again" },
      ],
      currency: "EURO",
    });
    expect(problems).toEqual([
      "The first price row must come after the headings row",
      "A price column's lengths are not right",
      "A column is used for two price columns",
      "The currency is a 3-letter code, e.g. EUR",
    ]);
  });
});

describe("findingRowsText", () => {
  it("lists the rows, with an ellipsis when there are more", () => {
    expect(findingRowsText({ rows: [22], count: 1 })).toBe("row 22");
    expect(findingRowsText({ rows: [22, 45], count: 2 })).toBe("rows 22, 45");
    expect(findingRowsText({ rows: [22, 45], count: 9 })).toBe("rows 22, 45 …");
    expect(findingRowsText({ rows: [], count: 1 })).toBe("");
  });
});
