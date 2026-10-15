import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

// The workbook library is pure apart from exceljs; the settings rules it uses load encore.dev/api.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
import {
  columnLetter,
  emptyTemplateInput,
  fileSlug,
  loadWorkbookTables,
  MAX_FILE_BYTES,
  parseDate,
  parseNumber,
  parsePostcode,
  parseYesNo,
  readTariffWorkbook,
  UnreadableFileError,
  writeTariffWorkbook,
  type WorkbookTariffInfo,
} from "../lib/tariffWorkbook";
import { validateVersion } from "../lib/tariffValidation";
import { diffVersions } from "../lib/tariffDiff";
import { cleanVersionInput } from "../lib/tariffRules";
import { DEFAULT_SERVICE_LEVELS } from "../lib/settingsRules";
import type { TariffVersionInput, ValidationFinding } from "../interfaces/interfaces";
import { EXAMPLE_TARIFF, standardSellExample } from "./fixtures/standardSellExample";

const FIXTURE = join(__dirname, "fixtures", "standard-sell-example.xlsx");
const DEFAULTS = { factors: { kgPerLdm: 1850, kgPerCbm: 333, kgPerPalletPlace: 450 }, today: "2026-10-15" };
const LABELS = Object.fromEntries(DEFAULT_SERVICE_LEVELS.map((l) => [l.code, l.label]));
const TARIFF: WorkbookTariffInfo = { name: "Standard LTL", side: "SELL", scope: "LTL", ownerName: null, currency: "CZK", zoneBy: "DESTINATION" };

/** Three levels, KG bands with an open top, PER_100KG, MIN rows, a remote zone, every surcharge calculation. */
const rich = (): TariffVersionInput => ({
  validFrom: "2026-11-01",
  validTo: "2027-06-30",
  factors: { kgPerLdm: 1750, kgPerCbm: 250, kgPerPalletPlace: 400 },
  rounding: { weightStepKg: 1, moneyStep: 0.01 },
  zones: [
    { code: "1", label: "Praha", postcodeFrom: "10000", postcodeTo: "19999", remote: false },
    { code: "6", label: "Brno region", postcodeFrom: "60000", postcodeTo: "69999", remote: false },
    { code: "6R", label: "Brno remote", postcodeFrom: "67900", postcodeTo: "67999", remote: true },
  ],
  bands: [
    { id: "b1", basis: "KG", fromExcl: 0, toIncl: 100 },
    { id: "b2", basis: "KG", fromExcl: 100, toIncl: 500 },
    { id: "b3", basis: "KG", fromExcl: 500, toIncl: null },
  ],
  rates: [
    { serviceLevel: "D1", zoneCode: "1", bandId: "b1", amount: 450, priceType: "FLAT" },
    { serviceLevel: "D1", zoneCode: "6", bandId: "b1", amount: 520.5, priceType: "FLAT" },
    { serviceLevel: "D1", zoneCode: "6R", bandId: "b1", amount: 610, priceType: "FLAT" },
    { serviceLevel: "D1", zoneCode: "1", bandId: "b2", amount: 3.2, priceType: "PER_UNIT" },
    { serviceLevel: "D1", zoneCode: "6", bandId: "b2", amount: 3.9, priceType: "PER_UNIT" },
    { serviceLevel: "D1", zoneCode: "1", bandId: "b3", amount: 290, priceType: "PER_100KG" },
    { serviceLevel: "D1", zoneCode: "6", bandId: "b3", amount: 330, priceType: "PER_100KG" },
    { serviceLevel: "D2", zoneCode: "1", bandId: "b1", amount: 400, priceType: "FLAT" },
    { serviceLevel: "D2", zoneCode: "6", bandId: "b1", amount: 480, priceType: "FLAT" },
    { serviceLevel: "D2", zoneCode: "1", bandId: "b2", amount: 2.9, priceType: "PER_UNIT" },
    { serviceLevel: "EXP_1000", zoneCode: "1", bandId: "b1", amount: 1200, priceType: "FLAT" },
    { serviceLevel: "EXP_1000", zoneCode: "6", bandId: "b1", amount: 1500, priceType: "FLAT" },
  ],
  minCharges: [
    { serviceLevel: "D1", zoneCode: "1", amount: 350 },
    { serviceLevel: "D1", zoneCode: "6R", amount: 500 },
    { serviceLevel: "EXP_1000", zoneCode: "6", amount: 900 },
  ],
  surcharges: [
    { code: "FUEL", calc: "FUEL_INDEX", value: 0, min: null, onBasePlusSurcharges: true },
    { code: "TOLL", calc: "PCT", value: 4.5, min: 30, onBasePlusSurcharges: false },
    { code: "ADR", calc: "FLAT", value: 350, min: null, onBasePlusSurcharges: false },
    { code: "B2C", calc: "PER_KG", value: 0.4, min: 120, onBasePlusSurcharges: false },
    { code: "TAIL_LIFT", calc: "PER_PALLET", value: 150, min: null, onBasePlusSurcharges: false },
    { code: "WAITING_TIME", calc: "PER_HOUR", value: 500, min: null, onBasePlusSurcharges: false },
    { code: "INSURANCE", calc: "PCT_OF_VALUE", value: 0.3, min: 200, onBasePlusSurcharges: false },
    { code: "REMOTE_AREA", calc: "FLAT", value: 250, min: null, onBasePlusSurcharges: false },
  ],
  notes: "Rich test version\nwith two lines",
});

const roundTrip = async (input: TariffVersionInput, tariff = TARIFF) => readTariffWorkbook(await writeTariffWorkbook({ tariff, input, levelLabels: LABELS }), DEFAULTS);

/** A workbook made of plain arrays (row 1 first), with an optional tweak of the exceljs workbook. */
async function xlsx(sheets: Record<string, unknown[][]>, tweak?: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name);
    rows.forEach((r, i) => {
      ws.getRow(i + 1).values = r as ExcelJS.CellValue[];
    });
  }
  tweak?.(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** A small valid file as arrays, for the robustness tests to bend. */
const base = (): Record<string, unknown[][]> => ({
  Meta: [
    ["Field", "Value"],
    ["Valid from", "2026-11-01"],
    ["Valid to", ""],
    ["kg per LDM", 1750],
    ["kg per m³", 250],
    ["kg per pallet place", 400],
    ["Weight step kg", 1],
    ["Money step", 0.01],
    ["Notes", "n"],
  ],
  Zones: [
    ["Zone code", "Label", "PSČ from", "PSČ to", "Remote"],
    ["1", "Praha", "100 00", "199 99", "N"],
    ["2", "Rest", "200 00", "799 99", "N"],
  ],
  D1: [
    ["D1"],
    [],
    ["Basis", "From (excl.)", "To (incl.)", "Price type", "1", "2"],
    ["KG", 0, 100, "FLAT", 400, 500],
    ["KG", 100, null, "PER_100KG", 300, 350],
    ["MIN", null, null, null, 350, null],
  ],
  Surcharges: [
    ["Code", "Calculation", "Value", "Minimum", "On freight + surcharges"],
    ["FUEL", "FUEL_INDEX", 0, null, "N"],
  ],
});

const read = async (sheets: Record<string, unknown[][]>, tweak?: (wb: ExcelJS.Workbook) => void) => readTariffWorkbook(await xlsx(sheets, tweak), DEFAULTS);
const errors = (r: { findings: ValidationFinding[] }) => r.findings.filter((f) => f.severity === "error");

describe("cell parsing", () => {
  it("reads numbers with a decimal comma or point, spaces and units", () => {
    expect(parseNumber(12.5)).toBe(12.5);
    expect(parseNumber("12,5")).toBe(12.5);
    expect(parseNumber("12.5")).toBe(12.5);
    expect(parseNumber("1 250,50")).toBe(1250.5);
    expect(parseNumber("1 250")).toBe(1250);
    expect(parseNumber("1.250,5")).toBe(1250.5);
    expect(parseNumber("1,250.5")).toBe(1250.5);
    expect(parseNumber("1.250.000")).toBe(1250000);
    expect(parseNumber("450 Kč")).toBe(450);
    expect(parseNumber("12 %")).toBe(12);
    expect(parseNumber("-3")).toBe(-3);
    expect(parseNumber("abc")).toBeNaN();
    expect(parseNumber("12abc")).toBeNaN();
    expect(parseNumber("")).toBeNaN();
    expect(parseNumber(true)).toBeNaN();
  });

  it("reads postcodes as text with a space, text or a number", () => {
    expect(parsePostcode("110 00")).toBe("11000");
    expect(parsePostcode("11000")).toBe("11000");
    expect(parsePostcode(11000)).toBe("11000");
    expect(parsePostcode("1100")).toBeNull();
    expect(parsePostcode(110.5)).toBeNull();
  });

  it("reads Excel dates, serial numbers, ISO and Czech text dates", () => {
    expect(parseDate(new Date(Date.UTC(2026, 10, 1)))).toBe("2026-11-01");
    expect(parseDate(46327)).toBe("2026-11-01");
    expect(parseDate("2026-11-01")).toBe("2026-11-01");
    expect(parseDate("1. 11. 2026")).toBe("2026-11-01");
    expect(parseDate("1.11.2026")).toBe("2026-11-01");
    expect(parseDate("2026-02-30")).toBeNull();
    expect(parseDate("next week")).toBeNull();
  });

  it("reads Y/N in English and Czech", () => {
    expect(parseYesNo("Y")).toBe(true);
    expect(parseYesNo("ano")).toBe(true);
    expect(parseYesNo("Ne")).toBe(false);
    expect(parseYesNo("")).toBe(false);
    expect(parseYesNo(true)).toBe(true);
    expect(parseYesNo("maybe")).toBeNull();
  });

  it("names columns like Excel", () => {
    expect([0, 5, 25, 26, 27].map(columnLetter)).toEqual(["A", "F", "Z", "AA", "AB"]);
    expect(fileSlug("Standard LTL – Praha Žižkov")).toBe("standard-ltl-praha-zizkov");
  });
});

describe("round trip", () => {
  it("gives back exactly the version it exported (3 levels, open top, PER_100KG, MIN, remote zone, every calculation)", async () => {
    const r = await roundTrip(rich());
    expect(r.findings).toEqual([]);
    expect(r.input).toEqual(rich());
    expect(cleanVersionInput(r.input)).toEqual(rich());
    expect(diffVersions(r.input, rich(), null).changedCells).toBe(0);
    expect(r.sheets.map((s) => [s.sheet, s.read])).toEqual([
      ["Read me", "ignored"],
      ["Meta", "used"],
      ["Zones", "used"],
      ["D1", "used"],
      ["D2", "used"],
      ["EXP_1000", "used"],
      ["Surcharges", "used"],
    ]);
  });

  it("keeps a band whose zones mix price types (one row per type)", async () => {
    const input = rich();
    input.rates[1] = { ...input.rates[1], priceType: "PER_UNIT", amount: 5 };
    const r = await roundTrip(input);
    expect(r.findings).toEqual([]);
    const key = (x: TariffVersionInput) => x.rates.map((t) => `${t.serviceLevel}|${t.zoneCode}|${t.bandId}|${t.priceType}|${t.amount}`).sort();
    expect(key(r.input)).toEqual(key(input));
  });

  it("writes the empty template: Meta from the settings, Zones header, D1 with only the MIN row, the fuel surcharge", async () => {
    const buffer = await writeTariffWorkbook({ tariff: TARIFF, input: emptyTemplateInput(DEFAULTS.factors, "2026-10-15"), levelLabels: LABELS, extraLevels: ["D1"] });
    const tables = await loadWorkbookTables(buffer);
    expect(tables.map((t) => t.name)).toEqual(["Read me", "Meta", "Zones", "D1", "Surcharges"]);
    const d1 = tables.find((t) => t.name === "D1")!.rows;
    expect(d1[2].slice(0, 4)).toEqual(["Basis", "From (excl.)", "To (incl.)", "Price type"]);
    expect(d1[3][0]).toBe("MIN");
    expect(tables.find((t) => t.name === "Surcharges")!.rows[1]).toEqual(["FUEL", "FUEL_INDEX", 0, "", "N"]);
    const r = await readTariffWorkbook(buffer, DEFAULTS);
    expect(r.input.factors).toEqual(DEFAULTS.factors);
    expect(r.input.validFrom).toBe("2026-10-15");
    expect(errors(r).map((f) => f.message)).toEqual(["The file has no prices: every price sheet is empty"]);
  });

  it("freezes the header rows and puts dropdowns on the coded columns", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await writeTariffWorkbook({ tariff: TARIFF, input: rich(), levelLabels: LABELS })) as never);
    const d1 = wb.getWorksheet("D1")!;
    expect(d1.views[0]).toMatchObject({ state: "frozen", ySplit: 3, xSplit: 4 });
    expect(d1.getCell("A4").dataValidation).toMatchObject({ type: "list", formulae: ['"KG,PALLET,LDM,TRIP,MIN"'] });
    expect(d1.getCell("D4").dataValidation).toMatchObject({ type: "list", formulae: ['"FLAT,PER_UNIT,PER_100KG"'] });
    expect(wb.getWorksheet("Zones")!.getCell("E2").dataValidation).toMatchObject({ formulae: ['"Y,N"'] });
    expect(wb.getWorksheet("Surcharges")!.getCell("B2").dataValidation.formulae?.[0]).toContain("FUEL_INDEX");
    expect(d1.getCell("A1").value).toBe("D1: +1 day");
  });
});

describe("the example Standard sell tariff", () => {
  it.skipIf(!process.env.WRITE_TRUCKING_FIXTURE)("is written by the template writer", async () => {
    writeFileSync(FIXTURE, await writeTariffWorkbook({ tariff: EXAMPLE_TARIFF, input: standardSellExample(), levelLabels: LABELS }));
  });

  it("imports cleanly from the committed file: the same input, no errors", async () => {
    const r = await readTariffWorkbook(readFileSync(FIXTURE), DEFAULTS);
    expect(r.findings).toEqual([]);
    expect(r.input).toEqual(standardSellExample());
    const findings = validateVersion(r.input, { fuelMonthCount: 3, activeInput: null });
    expect(findings).toEqual([]);
    expect(r.input.zones).toHaveLength(9);
    expect(r.sheets.filter((s) => s.read === "used").map((s) => s.sheet)).toEqual(["Meta", "Zones", "D1", "D2", "D3", "D4", "EXP_1000", "Surcharges"]);
  });
});

describe("reading filled files", () => {
  it("reads the base file without findings", async () => {
    const r = await read(base());
    expect(r.findings).toEqual([]);
    expect(r.input.rates).toHaveLength(4);
    expect(r.input.minCharges).toEqual([{ serviceLevel: "D1", zoneCode: "1", amount: 350 }]);
    expect(r.input.bands).toEqual([
      { id: "b1", basis: "KG", fromExcl: 0, toIncl: 100 },
      { id: "b2", basis: "KG", fromExcl: 100, toIncl: null },
    ]);
  });

  it("accepts decimal commas and spaces in numbers", async () => {
    const s = base();
    s.D1[3] = ["KG", "0", "100", "FLAT", "400,50", "1 250,5"];
    s.Meta[7] = ["Money step", "0,01"];
    s.Surcharges[2] = ["TOLL", "PCT", "4,5", "30", "Y"];
    const r = await read(s);
    expect(r.findings).toEqual([]);
    expect(r.input.rates.slice(0, 2).map((x) => x.amount)).toEqual([400.5, 1250.5]);
    expect(r.input.rounding.moneyStep).toBe(0.01);
    expect(r.input.surcharges[1]).toEqual({ code: "TOLL", calc: "PCT", value: 4.5, min: 30, onBasePlusSurcharges: true });
  });

  it('accepts postcodes as "110 00", numbers and plain digits', async () => {
    const s = base();
    s.Zones[1] = ["1", "Praha", 10000, "19999", ""];
    s.Zones[2] = ["2", "Rest", "200 00", 79999, "Ano"];
    const r = await read(s);
    expect(r.findings).toEqual([]);
    expect(r.input.zones).toEqual([
      { code: "1", label: "Praha", postcodeFrom: "10000", postcodeTo: "19999", remote: false },
      { code: "2", label: "Rest", postcodeFrom: "20000", postcodeTo: "79999", remote: true },
    ]);
  });

  it("accepts Excel dates as well as text dates", async () => {
    const s = base();
    s.Meta[1] = ["Valid from", new Date(Date.UTC(2026, 10, 1))];
    s.Meta[2] = ["Valid to", "31. 12. 2026"];
    const r = await read(s, (wb) => {
      wb.getWorksheet("Meta")!.getCell("B2").numFmt = "d.m.yyyy";
    });
    expect(r.findings).toEqual([]);
    expect([r.input.validFrom, r.input.validTo]).toEqual(["2026-11-01", "2026-12-31"]);
  });

  it("treats blank cells as no price", async () => {
    const s = base();
    s.D1[3] = ["KG", 0, 100, "FLAT", null, 500];
    s.D1[4] = ["KG", 100, null, "PER_100KG", "", "-"];
    const r = await read(s);
    expect(errors(r)).toEqual([]);
    expect(r.input.rates).toEqual([{ serviceLevel: "D1", zoneCode: "2", bandId: "b1", amount: 500, priceType: "FLAT" }]);
  });

  it("reads the result of formulas", async () => {
    const r = await read(base(), (wb) => {
      wb.getWorksheet("D1")!.getCell("F4").value = { formula: "E4*1.25", result: 500 };
    });
    expect(r.findings).toEqual([]);
    expect(r.input.rates[1].amount).toBe(500);
  });

  it("ignores merged title cells", async () => {
    const r = await read(base(), (wb) => {
      const d1 = wb.getWorksheet("D1")!;
      d1.getCell("A1").value = "D1 +1 day, all zones";
      d1.mergeCells("A1:F1");
      d1.getCell("E2").value = "Zones";
      d1.mergeCells("E2:F2");
    });
    expect(r.findings).toEqual([]);
    expect(r.input.rates).toHaveLength(4);
  });

  it("finds sheets whatever their case, and warns about sheets it does not know", async () => {
    const s = base();
    const r = await read({ meta: s.Meta, ZONES: s.Zones, d1: s.D1, " surcharges ": s.Surcharges, "My notes": [["anything"]] });
    expect(errors(r)).toEqual([]);
    expect(r.findings).toEqual([{ severity: "warning", message: "Sheet My notes was ignored", where: "Sheet My notes" }]);
    expect(r.input.rates).toHaveLength(4);
    expect(r.sheets.find((x) => x.sheet === "My notes")).toMatchObject({ read: "ignored" });
    expect(r.sheets.find((x) => x.sheet === "D1")).toMatchObject({ read: "used", rows: 3, note: "2 bands, 4 prices" });
  });

  it("fills empty Meta values from the settings with a warning; a missing valid-from is an error", async () => {
    const s = base();
    s.Meta = [["Field", "Value"], ["kg per LDM", ""], ["Notes", "x"]];
    const r = await read(s);
    expect(r.input.factors).toEqual(DEFAULTS.factors);
    expect(r.input.rounding).toEqual({ weightStepKg: 1, moneyStep: 0.01 });
    expect(r.input.validFrom).toBe("2026-10-15");
    expect(errors(r)).toEqual([{ severity: "error", message: "Valid from is empty; 2026-10-15 stands in until a file with the date is uploaded", where: "Sheet Meta" }]);
    expect(r.findings).toContainEqual({ severity: "warning", message: "kg per LDM is empty: 1 850 from the Trucking settings was used", where: "Sheet Meta, row 2, column B" });
    expect(r.findings.filter((f) => f.severity === "warning")).toHaveLength(5);
  });

  it("reports a bad number with its sheet, row and column and leaves the cell out", async () => {
    const s = base();
    s.D1[4] = ["KG", 100, null, "PER_100KG", 300, "35O"];
    s.Meta[3] = ["kg per LDM", "lots"];
    const r = await read(s);
    expect(errors(r)).toEqual([
      { severity: "error", message: 'kg per LDM "lots" is not a number above 0; 1 850 stands in', where: "Sheet Meta, row 4, column B" },
      { severity: "error", message: '"35O" is not a number', where: "Sheet D1, row 5, column F" },
    ]);
    expect(r.input.rates).toHaveLength(3);
  });

  it("reports rows it cannot read: basis, limits, price type, surcharge codes", async () => {
    const s = base();
    s.D1.splice(5, 0, ["KGS", 1, 2, "FLAT", 1, 1], ["KG", "x", 2, "FLAT", 1, 1], ["KG", 1, "y", "FLAT", 1, 1], ["KG", 1, 2, "", 1, 1]);
    s.Surcharges.push(["PETROL", "PCT", 1, null, "N"], ["ADR", "PERCENT", 1, null, "N"], ["TOLL", "PCT", "", null, "N"], ["B2C", "FLAT", 100, null, "perhaps"]);
    const r = await read(s);
    expect(errors(r).map((f) => f.where)).toEqual([
      "Sheet D1, row 6, column A",
      "Sheet D1, row 7, column B",
      "Sheet D1, row 8, column C",
      "Sheet D1, row 9, column D",
      "Sheet Surcharges, row 3, column A",
      "Sheet Surcharges, row 4, column B",
      "Sheet Surcharges, row 5, column C",
      "Sheet Surcharges, row 6, column E",
    ]);
    expect(r.input.surcharges.map((x) => x.code)).toEqual(["FUEL", "B2C"]);
  });

  it("refuses a duplicate zone code and a column for an unknown zone", async () => {
    const s = base();
    s.Zones.push(["2", "Again", "800 00", "899 99", "N"]);
    s.D1[2] = [...s.D1[2], "9"];
    const r = await read(s);
    expect(errors(r)).toEqual([
      { severity: "error", message: "Zone code 2 is used twice: this row was skipped", where: "Sheet Zones, row 4, column A" },
      { severity: "error", message: "Zone 9 is not on the Zones sheet: its column was skipped", where: "Sheet D1, row 3, column G" },
    ]);
    expect(r.input.zones).toHaveLength(2);
  });

  it("skips a zone with a bad postcode and its columns without more errors", async () => {
    const s = base();
    s.Zones[2] = ["2", "Rest", "200 00", "7999", "N"];
    const r = await read(s);
    expect(errors(r)).toEqual([{ severity: "error", message: 'PSČ to "7999" is not a postcode like 110 00: zone 2 was skipped', where: "Sheet Zones, row 3, column D" }]);
    expect(r.input.rates.every((x) => x.zoneCode === "1")).toBe(true);
  });

  it("shares bands between sheets and refuses a band that crosses another sheet's band", async () => {
    const s = base();
    s.D2 = [
      ["D2"],
      [],
      ["Basis", "From (excl.)", "To (incl.)", "Price type", "1", "2"],
      ["KG", 0, 100, "FLAT", 380, 450],
      ["KG", 100, 300, "PER_100KG", 280, 320],
    ];
    const r = await read(s);
    expect(errors(r)).toEqual([
      {
        severity: "error",
        message: "Band 101–300 kg overlaps band over 100 kg of sheet D1: use the same bands on every sheet. The row was skipped",
        where: "Sheet D2, row 5, column B",
      },
    ]);
    expect(r.input.bands).toHaveLength(2);
    expect(r.input.rates.filter((x) => x.serviceLevel === "D2").map((x) => x.bandId)).toEqual(["b1", "b1"]);
  });

  it("reports missing sheets", async () => {
    const s = base();
    const r = await read({ D1: s.D1 });
    expect(r.findings.map((f) => f.message)).toEqual([
      "The Meta sheet is missing: valid from, the factors and the rounding could not be read",
      "The Zones sheet is missing: no zones were read",
      "Zone 1 is not on the Zones sheet: its column was skipped",
      "Zone 2 is not on the Zones sheet: its column was skipped",
      "The file has no prices: every price sheet is empty",
      "There is no Surcharges sheet: the version has no surcharges",
    ]);
    expect(r.sheets.filter((x) => x.read === "missing").map((x) => x.sheet)).toEqual(["Meta", "Zones", "Surcharges"]);
    const none = await read({ Meta: s.Meta, Zones: s.Zones, Surcharges: s.Surcharges });
    expect(errors(none).map((f) => f.message)).toEqual(["There is no price sheet (D1, D2, D3, D4, EXP_SAMEDAY, EXP_1000, EXP_1200 or EXP_FIXED)"]);
  });

  it("refuses files over 5 MB and files that are not .xlsx, in plain words", async () => {
    const big = Buffer.alloc(MAX_FILE_BYTES + 1);
    big.writeUInt32BE(0x504b0304, 0);
    await expect(loadWorkbookTables(big)).rejects.toThrow("The file is larger than 5 MB");
    await expect(loadWorkbookTables(Buffer.from("Zone code;Label\n1;Praha"))).rejects.toThrow("This is not an Excel .xlsx file");
    const xls = Buffer.alloc(16);
    xls.writeUInt32BE(0xd0cf11e0, 0);
    await expect(loadWorkbookTables(xls)).rejects.toThrow("old Excel 97–2003 (.xls)");
    const brokenZip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(100)]);
    await expect(loadWorkbookTables(brokenZip)).rejects.toBeInstanceOf(UnreadableFileError);
  });
});
