import { describe, expect, it, vi } from "vitest";

// The sheet reader names its upload errors with Encore's APIError; a unit test has no Encore runtime.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import type { RailBand, RailLayout } from "../interfaces/interfaces";
import { bandCode, convertRail, findingTotals, postcodeRange } from "../lib/railConvert";
import type { CellValue, Sheet } from "../lib/sheet";

const band = (column: string, label: string, minLengthFt: number, maxLengthFt: number, maxGrossTonnes: number | null): RailBand => ({
  column,
  label,
  minLengthFt,
  maxLengthFt,
  maxGrossTonnes,
});

// A small price list laid out like an operator's real one: title and terms above the headings,
// Via/Depot in one column, seven container/weight bands, a notice column and row validity.
const BANDS = [
  band("E", "20' 0<14 t", 20, 20, 14),
  band("F", "20'<25 t", 20, 20, 25),
  band("G", "20'<32 t", 20, 20, 32),
  band("H", "21'-29' 0<32 t", 21, 29, 32),
  band("I", "30' 0<34 t", 30, 30, 34),
  band("J", "40' 0<27 t", 40, 40, 27),
  band("K", "40'<34 t", 40, 40, 34),
];

const LAYOUT: RailLayout = {
  sheet: "Road",
  headerRow: 3,
  firstDataRow: 4,
  lastDataRow: null,
  columns: { country: "A", postcode: "B", place: "C", region: "O", via: "D", emptyDepot: "D", note: "L", validFrom: "M", validTo: "N" },
  bands: BANDS,
  currency: "EUR",
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  defaultCountry: "CZ",
  conditions: [],
  links: [],
  name: "Hamburg – Czechia",
};

const JAN1 = new Date(Date.UTC(2026, 0, 1));
const DEC31 = new Date(Date.UTC(2026, 11, 31));
const prices = (...amounts: (CellValue | undefined)[]) =>
  Object.fromEntries(amounts.map((a, i) => [BANDS[i]!.column, a]).filter(([, a]) => a !== undefined));

const sheetOf = (rows: Record<number, Record<string, CellValue | undefined>>): Sheet => {
  const map = new Map<number, Record<string, CellValue>>();
  for (const [rowNo, cells] of Object.entries(rows)) {
    map.set(Number(rowNo), Object.fromEntries(Object.entries(cells).filter(([, v]) => v !== undefined)) as Record<string, CellValue>);
  }
  return { name: "Road", rowCount: Math.max(...map.keys()), rows: map, links: [] };
};

const ROW_OK = { A: "CZ", B: "36235", C: "Abertamy", D: "Usti/Usti", ...prices(746, 866, 944, 1046, 1095, 1060, 1184), M: JAN1, N: DEC31 };

describe("bandCode", () => {
  it("names a band by its lengths and weight", () => {
    expect(BANDS.map(bandCode)).toEqual(["20ft-14t", "20ft-25t", "20ft-32t", "21-29ft-32t", "30ft-34t", "40ft-27t", "40ft-34t"]);
    expect(bandCode(band("A", "40'", 40, 40, null))).toBe("40ft-any");
    expect(bandCode(band("A", "20' 32.5 t", 20, 20, 32.5))).toBe("20ft-32.5t");
  });
});

describe("postcodeRange", () => {
  it("covers a postcode, a 1xxxx area, or the range a note names", () => {
    expect(postcodeRange("36235", "")).toEqual({ from: "36235", to: "36235" });
    expect(postcodeRange("362 35", "")).toEqual({ from: "36235", to: "36235" });
    expect(postcodeRange("1xxxx", "")).toEqual({ from: "10000", to: "19999" });
    expect(postcodeRange("11000", "ZIP 10000-19900")).toEqual({ from: "10000", to: "19900" });
    expect(postcodeRange("", "PSČ 300 00 – 326 00")).toEqual({ from: "30000", to: "32600" });
    expect(postcodeRange("A-1010", "")).toBeNull();
    expect(postcodeRange("", "")).toBeNull();
  });
});

describe("convertRail", () => {
  it("reads every price row: terminals split, postcode range, dates and prices by band", () => {
    const sheet = sheetOf({
      1: { A: "Rail/Road Price List 2026" },
      2: { A: "ALLIN RATE including road tolls" },
      3: { A: "Country", B: "PLZ", C: "Destination", D: "Via/Depot", E: "20' 0<14 t", L: "Notice", M: "Valid from", N: "Valid till", O: "Region" },
      4: ROW_OK,
      5: {},
      6: { A: "CZ", B: "11000", C: "Praha", D: "Praha/Praha", ...prices(560, 679, 719, 822, 850, 875, 941), L: "ZIP 10000-19900", M: "01.01.2026", N: "2026-12-31", O: "Praha" },
      7: { A: "cz", B: "1xxxx", C: "Praha CFS", D: "Praha", ...prices("460", "1 046", "1.046,50", "1,046.50", "1046 EUR", "€ 1046", "-") },
    });
    const { rows, findings } = convertRail(sheet, LAYOUT);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      rowNo: 4,
      country: "CZ",
      postcode: "36235",
      postcodeFrom: "36235",
      postcodeTo: "36235",
      place: "Abertamy",
      region: "",
      via: "Usti",
      emptyDepot: "Usti",
      note: "",
      validFrom: "2026-01-01",
      validTo: "2026-12-31",
      prices: { "20ft-14t": 746, "20ft-25t": 866, "20ft-32t": 944, "21-29ft-32t": 1046, "30ft-34t": 1095, "40ft-27t": 1060, "40ft-34t": 1184 },
    });
    expect(rows[1]).toMatchObject({ place: "Praha", postcodeFrom: "10000", postcodeTo: "19900", note: "ZIP 10000-19900", region: "Praha", validFrom: "2026-01-01" });
    expect(rows[2]).toMatchObject({
      country: "CZ",
      postcodeFrom: "10000",
      postcodeTo: "19999",
      via: "Praha",
      emptyDepot: "Praha",
      validFrom: null,
      prices: { "20ft-14t": 460, "20ft-25t": 1046, "20ft-32t": 1046.5, "21-29ft-32t": 1046.5, "30ft-34t": 1046, "40ft-27t": 1046 },
    });
    // "-" is no price: only the band-empty note, nothing worse.
    expect(findings.map((f) => f.code)).toEqual(["band_empty"]);
    expect(findings[0]).toMatchObject({ level: "warning", column: "K", count: 1, rows: [7] });
  });

  it("splits via and depot only when one column holds both", () => {
    const layout = { ...LAYOUT, columns: { ...LAYOUT.columns, emptyDepot: "P" } };
    const { rows } = convertRail(sheetOf({ 4: { ...ROW_OK, D: "Praha", P: "Melnik" } }), layout);
    expect(rows[0]).toMatchObject({ via: "Praha", emptyDepot: "Melnik" });
  });

  it("takes the default country when the sheet has none", () => {
    const layout = { ...LAYOUT, columns: { ...LAYOUT.columns, country: null }, defaultCountry: "SK" };
    expect(convertRail(sheetOf({ 4: ROW_OK }), layout).rows[0]!.country).toBe("SK");
  });

  it("flags text prices, duplicates, heavier-cheaper rows and odd postcodes, keeping the rows", () => {
    const sheet = sheetOf({
      4: ROW_OK,
      5: ROW_OK,
      6: { ...ROW_OK, C: "Adamov", B: "AT-1010", ...prices(746, 700, 944, "on demand", 1095, 1060, 1184) },
    });
    const { rows, findings } = convertRail(sheet, LAYOUT);
    expect(rows).toHaveLength(3);
    expect(rows[2]!.prices).not.toHaveProperty("21-29ft-32t");
    const byCode = Object.fromEntries(findings.map((f) => [f.code, f]));
    expect(byCode.duplicate_row).toMatchObject({ level: "warning", count: 1, rows: [5] });
    expect(byCode.heavier_cheaper).toMatchObject({ level: "warning", count: 1, rows: [6] });
    expect(byCode.price_not_number).toMatchObject({ level: "warning", column: "H", rows: [6] });
    expect(byCode.postcode_unreadable).toMatchObject({ level: "warning", column: "B", rows: [6] });
    expect(findingTotals(findings)).toEqual({ errors: 0, warnings: 4 });
  });

  it("errors on prices without a place and below zero; reads 0 as no price; skips footnotes and headings", () => {
    const sheet = sheetOf({
      4: ROW_OK,
      5: { ...ROW_OK, C: undefined },
      6: { ...ROW_OK, C: "Zvole", ...prices(0, 866, 944, 1046, 1095, 1060, 1184) },
      7: { A: "Prices are without VAT" },
      8: { ...ROW_OK, C: "Brno", ...prices(-5, 866, 944, 1046, 1095, 1060, 1184) },
      9: { C: "Region Jihomoravsky" },
    });
    const { rows, findings } = convertRail(sheet, LAYOUT);
    expect(rows.map((r) => r.rowNo)).toEqual([4, 6, 8]);
    expect(rows[1]!.prices).not.toHaveProperty("20ft-14t");
    const byCode = Object.fromEntries(findings.map((f) => [f.code, f]));
    expect(byCode.place_missing).toMatchObject({ level: "error", rows: [5] });
    expect(byCode.price_zero).toMatchObject({ level: "warning", column: "E", rows: [6] });
    expect(byCode.price_not_positive).toMatchObject({ level: "error", column: "E", rows: [8] });
    expect(byCode.row_without_prices).toMatchObject({ level: "warning", rows: [9] });
    expect(findings[0]!.level).toBe("error");
    expect(findingTotals(findings).errors).toBe(2);
  });

  it("reads only to the last price row when one is set", () => {
    const sheet = sheetOf({ 4: ROW_OK, 5: { ...ROW_OK, C: "Brno" }, 7: { E: 12, F: "*" } });
    const { rows, findings } = convertRail(sheet, { ...LAYOUT, lastDataRow: 5 });
    expect(rows.map((r) => r.rowNo)).toEqual([4, 5]);
    expect(findings.filter((f) => f.level === "error")).toEqual([]);
  });

  it("errors when two price columns are set to the same container and weight", () => {
    const { findings } = convertRail(sheetOf({ 4: ROW_OK }), { ...LAYOUT, bands: [...LAYOUT.bands, { ...LAYOUT.bands[0]!, column: "L" }] });
    expect(findings.find((f) => f.code === "band_duplicate")).toMatchObject({ level: "error", column: "L", message: expect.stringContaining("E and L") });
  });

  it("reads prices written with ',-', keeps a postcode's leading zero and refuses days that do not exist", () => {
    const sheet = sheetOf({ 4: { ...ROW_OK, B: 1067, E: "1.046,-", M: "31.04.2026" } });
    const { rows, findings } = convertRail(sheet, LAYOUT);
    expect(rows[0]).toMatchObject({ postcode: "01067", postcodeFrom: "01067", validFrom: null, prices: expect.objectContaining({ "20ft-14t": 1046 }) });
    expect(findings.find((f) => f.code === "date_unreadable")).toMatchObject({ rows: [4] });
  });

  it("warns on unreadable dates and rows dated outside the tariff's validity", () => {
    const sheet = sheetOf({
      4: { ...ROW_OK, M: "soon" },
      5: { ...ROW_OK, C: "Brno", N: new Date(Date.UTC(2027, 5, 30)) },
      6: { ...ROW_OK, C: "Zlin", M: 46023 },
    });
    const { rows, findings } = convertRail(sheet, LAYOUT);
    expect(rows[0]!.validFrom).toBeNull();
    expect(rows[2]!.validFrom).toBe("2026-01-01");
    const byCode = Object.fromEntries(findings.map((f) => [f.code, f]));
    expect(byCode.date_unreadable).toMatchObject({ column: "M", rows: [4] });
    expect(byCode.row_validity_outside).toMatchObject({ rows: [5] });
  });

  it("warns on a price far from its band's usual level", () => {
    const rows: Record<number, Record<string, CellValue>> = {};
    for (let r = 4; r < 14; r++) rows[r] = { ...ROW_OK, C: `Place ${r}` };
    rows[10] = { ...ROW_OK, C: "Typo", E: 7460 };
    const { findings } = convertRail(sheetOf(rows), LAYOUT);
    const outlier = findings.find((f) => f.code === "price_outlier");
    expect(outlier).toMatchObject({ level: "warning", column: "E", count: 1, rows: [10] });
  });

  it("errors when nothing is read, no price column is set or the start date is missing", () => {
    const { rows, findings } = convertRail(sheetOf({ 1: { A: "Title" } }), { ...LAYOUT, bands: [], validFrom: null, validTo: null });
    expect(rows).toEqual([]);
    expect(findings.filter((f) => f.level === "error").map((f) => f.code).sort()).toEqual(["no_bands", "no_rows", "validity_missing"]);
    expect(findings.find((f) => f.code === "no_end_date")?.level).toBe("warning");
  });

  it("keeps the first 20 rows of a problem and counts them all", () => {
    const rows: Record<number, Record<string, CellValue>> = {};
    for (let r = 4; r < 34; r++) rows[r] = { ...ROW_OK, C: `Place ${r}`, K: undefined as never };
    const { findings } = convertRail(sheetOf(rows), LAYOUT);
    const empty = findings.find((f) => f.code === "band_empty")!;
    expect(empty.count).toBe(30);
    expect(empty.rows).toHaveLength(20);
  });
});
