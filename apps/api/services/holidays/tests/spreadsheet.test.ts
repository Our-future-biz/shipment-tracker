import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseCsv, readWorkbook, rowsFromTable } from "../lib/spreadsheet";

const HEADERS = [
  "Country", "Country code", "National holiday", "National start date", "National end date",
  "Regional holiday", "Regional start date", "Regional end date", "Region(s) / subdivision(s)",
];

describe("World Holidays spreadsheet", () => {
  it("reads an .xlsx with the holiday columns directly, below a title row", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Holidays");
    ws.addRow(["World public holidays 2026"]);
    ws.addRow(HEADERS);
    ws.addRow(["Austria", "AT", "Epiphany", new Date(Date.UTC(2026, 0, 6)), new Date(Date.UTC(2026, 0, 6)), "", "", "", ""]);
    ws.addRow(["Germany", "DE", "", "", "", "Corpus Christi", "04.06.2026", "", "Bavaria, Hesse"]);
    ws.addRow(["", "", "", "", "", "", "", "", ""]);
    const tables = await readWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(rowsFromTable(tables[0]!)).toEqual([
      {
        country: "Austria", countryCode: "AT", nationalHoliday: "Epiphany", nationalStart: "2026-01-06", nationalEnd: "2026-01-06",
        regionalHoliday: "", regionalStart: "", regionalEnd: "", regions: "",
      },
      {
        country: "Germany", countryCode: "DE", nationalHoliday: "", nationalStart: "", nationalEnd: "",
        regionalHoliday: "Corpus Christi", regionalStart: "2026-06-04", regionalEnd: "2026-06-04", regions: "Bavaria, Hesse",
      },
    ]);
  });

  it("reads a semicolon CSV with quoted values", () => {
    const table = parseCsv(`${HEADERS.join(";")}\nSlovakia;SK;"Epiphany; Three Kings";06.01.2026;;;;;`);
    expect(rowsFromTable(table)?.[0]).toMatchObject({ country: "Slovakia", nationalHoliday: "Epiphany; Three Kings", nationalEnd: "2026-01-06" });
  });

  it("leaves other sheets to the AI", () => {
    expect(rowsFromTable([["Date", "Name"], ["2026-01-01", "New Year"]])).toBeNull();
  });
});
