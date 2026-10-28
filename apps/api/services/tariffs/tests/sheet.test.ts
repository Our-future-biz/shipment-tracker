import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { MAX_UNPACKED_BYTES, cellText, columnIndex, columnLetter, readSheets, sheetExcerpt, sheetPreview, type Sheet } from "../lib/sheet";
import { zipUnpackedBytes } from "../../../lib/zipSize";

async function workbookBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("26Road");
  ws.addRow(["Rail price list 2026"]);
  ws.mergeCells("A1:D1");
  ws.addRow([]);
  ws.getCell("A3").value = { text: "Surcharges are here", hyperlink: "https://example.com/surcharges" };
  ws.addRow(["Country", "PLZ", "Destination", "Via/Depot"]);
  ws.addRow(["CZ", "36235", "Abertamy", "Usti/Usti"]);
  ws.getCell("E5").value = { formula: "1+1", result: 2 };
  ws.getCell("F5").value = { richText: [{ text: "valid " }, { text: "2026" }] };
  ws.getCell("G5").value = new Date(Date.UTC(2026, 0, 1));
  wb.addWorksheet("Hidden", { state: "hidden" }).addRow(["secret"]);
  wb.addWorksheet("Empty");
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("readSheets", () => {
  it("reads visible sheets with values by row and column, a merged range once, links aside", async () => {
    const sheets = await readSheets(await workbookBuffer(), "tariff.xlsx");
    expect(sheets.map((s) => s.name)).toEqual(["26Road"]);
    const [sheet] = sheets as [Sheet];
    expect(sheet.rowCount).toBe(5);
    expect(sheet.rows.get(1)).toEqual({ A: "Rail price list 2026" });
    expect(sheet.rows.has(2)).toBe(false);
    expect(sheet.rows.get(3)).toEqual({ A: "Surcharges are here" });
    expect(sheet.rows.get(5)).toEqual({ A: "CZ", B: "36235", C: "Abertamy", D: "Usti/Usti", E: 2, F: "valid 2026", G: new Date(Date.UTC(2026, 0, 1)) });
    expect(sheet.links).toEqual([{ address: "A3", text: "Surcharges are here", url: "https://example.com/surcharges" }]);
  });

  it("reads hidden sheets too when asked, marked as hidden, with the formulas of computed cells", async () => {
    const sheets = await readSheets(await workbookBuffer(), "tariff.xlsx", { hidden: true });
    expect(sheets.map((s) => [s.name, !!s.hidden])).toEqual([
      ["26Road", false],
      ["Hidden", true],
    ]);
    expect(sheets[0]!.formulas?.get(5)).toEqual({ E: "=1+1" });
    const excerpt = sheetExcerpt(sheets[1]!);
    expect(excerpt).toContain('Sheet "Hidden" (hidden)');
    expect(sheetExcerpt(sheets[0]!, { formulas: true })).toContain("E=2 {=1+1}");
    expect(sheetExcerpt(sheets[0]!)).not.toContain("{=1+1}");
  });

  it("gives a cell merged down over several rows to each of them, a merge across only to its first cell", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Prices");
    ws.addRow(["Place", "Via", "20'"]);
    ws.addRow(["Brno", "Cetr", 781]);
    ws.addRow([null, null, 905]);
    ws.mergeCells("A2:A3");
    ws.mergeCells("B2:B3");
    ws.addRow(["Note across", null, null]);
    ws.mergeCells("A4:C4");
    const [sheet] = await readSheets(Buffer.from(await wb.xlsx.writeBuffer()), "tariff.xlsx");
    expect(sheet!.rows.get(3)).toEqual({ A: "Brno", B: "Cetr", C: 905 });
    expect(sheet!.rows.get(4)).toEqual({ A: "Note across" });
  });

  it("numbers CSV rows as Excel does, keeps line breaks inside quotes and reads Czech Windows text", async () => {
    const [sheet] = await readSheets(Buffer.from('Place;Price\n\n"Ceska\nTrebova";630\r\nBrno;781'), "rail.csv");
    expect(sheet!.rows.get(3)).toEqual({ A: "Ceska\nTrebova", B: "630" });
    expect(sheet!.rows.get(4)).toEqual({ A: "Brno", B: "781" });
    // "Ústí;559" as Czech Excel saves it (Windows-1250): Ú is 0xDA, í is 0xED.
    const [cp1250] = await readSheets(Buffer.from([0xda, 0x73, 0x74, 0xed, 0x3b, 0x35, 0x35, 0x39]), "rail.csv");
    expect(cp1250!.rows.get(1)).toEqual({ A: "Ústí", B: "559" });
  });

  it("reads a CSV with ; or , and quoted cells", async () => {
    const [semi] = await readSheets(Buffer.from('﻿Country;Place;20\'\nCZ;"Praha; CFS";560\n\n'), "rail.csv");
    expect(semi!.name).toBe("rail");
    expect(semi!.rows.get(2)).toEqual({ A: "CZ", B: "Praha; CFS", C: "560" });
    const [comma] = await readSheets(Buffer.from('Place,Price\n"Brno ""CFS""",781\n'), "rail.csv");
    expect(comma!.rows.get(2)).toEqual({ A: 'Brno "CFS"', B: "781" });
  });

  it("refuses an old .xls saved as .xlsx and a file that is no workbook, saying what to do", async () => {
    const xls = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    await expect(readSheets(xls, "tariff.xlsx")).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringContaining("97–2003") });
    await expect(readSheets(Buffer.from("not a zip at all"), "tariff.xlsx")).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringContaining(".xlsx") });
  });

  it("refuses a workbook whose zip directory declares far more than a tariff unpacks to, before unpacking it", async () => {
    const buffer = await workbookBuffer();
    const limits = { maxEntries: 5000, maxBytes: MAX_UNPACKED_BYTES };
    expect(zipUnpackedBytes(buffer, limits)).toBeGreaterThan(0);
    expect(zipUnpackedBytes(buffer, limits)).toBeLessThan(MAX_UNPACKED_BYTES);
    // Declare one part's unpacked size as 2 GB in the central directory, as a zip bomb does.
    const bomb = Buffer.from(buffer);
    const eocd = bomb.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    bomb.writeUInt32LE(0x80000000, bomb.readUInt32LE(eocd + 16) + 24);
    await expect(readSheets(bomb, "tariff.xlsx")).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringContaining("100 MB") });
  });

  it("refuses other files, naming what to upload instead", async () => {
    await expect(readSheets(Buffer.from(""), "tariff.xls")).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringContaining(".xlsx") });
    await expect(readSheets(Buffer.from(""), "tariff.pdf")).rejects.toMatchObject({ code: "invalid_argument" });
  });
});

describe("columns and cells", () => {
  it("turn column numbers into letters and back", () => {
    expect([1, 26, 27, 52, 703].map(columnLetter)).toEqual(["A", "Z", "AA", "AZ", "AAA"]);
    expect(["A", "Z", "AA", "az", "AAA"].map(columnIndex)).toEqual([1, 26, 27, 52, 703]);
  });

  it("give a cell as one line of text", () => {
    expect(cellText(new Date(Date.UTC(2026, 11, 31)))).toBe("2026-12-31");
    expect(cellText(1046.5)).toBe("1046.5");
    expect(cellText("  valid for\n stacker delivery ")).toBe("valid for stacker delivery");
    expect(cellText(undefined)).toBe("");
  });
});

const bigSheet = (): Sheet => {
  const rows = new Map<number, Record<string, string | number>>();
  rows.set(1, { A: "Rail price list" });
  rows.set(2, { A: "Country", B: "PLZ", C: "Destination", D: "20'", E: "Notice" });
  for (let r = 3; r <= 500; r++) rows.set(r, { A: "CZ", B: String(10000 + r), C: `Place ${r}`, D: 500 + r });
  rows.get(300)!.E = "ZIP 30000-32600";
  return { name: "Rates", rowCount: 500, rows, links: [{ address: "A1", text: "Rail price list", url: "https://example.com" }] };
};

describe("sheetPreview", () => {
  it("gives the first rows as text by column", () => {
    const preview = sheetPreview(bigSheet(), 3);
    expect(preview).toEqual({
      name: "Rates",
      rowCount: 500,
      rows: [
        { rowNo: 1, cells: { A: "Rail price list" } },
        { rowNo: 2, cells: { A: "Country", B: "PLZ", C: "Destination", D: "20'", E: "Notice" } },
        { rowNo: 3, cells: { A: "CZ", B: "10003", C: "Place 3", D: "503" } },
      ],
    });
  });
});

describe("sheetExcerpt", () => {
  it("shows the head, a sample of the rest, the rows using a rare column, and the links", () => {
    const text = sheetExcerpt(bigSheet());
    const lines = text.split("\n");
    expect(lines[0]).toBe('Sheet "Rates": 500 rows, columns A–E');
    expect(lines[1]).toBe("R1: A=Rail price list");
    expect(lines[40]).toBe("R40: A=CZ | B=10040 | C=Place 40 | D=540");
    expect(lines[41]).toBe("… rows 41–500: a sample, and the rows using rarely filled columns:");
    expect(text).toContain("R300: A=CZ | B=10300 | C=Place 300 | D=800 | E=ZIP 30000-32600");
    const rowLines = lines.filter((l) => l.startsWith("R"));
    expect(rowLines.length).toBeLessThanOrEqual(40 + 15 + 10);
    expect(text.endsWith("Links:\nA1: Rail price list → https://example.com")).toBe(true);
  });

  it("cuts very long cells", () => {
    const sheet: Sheet = { name: "S", rowCount: 1, rows: new Map([[1, { A: "x".repeat(300) }]]), links: [] };
    expect(sheetExcerpt(sheet).split("\n")[1]).toBe(`R1: A=${"x".repeat(200)}…`);
  });

  it("shows the AI at most 60 cells of a row, and the preview at most 100, each cut short", () => {
    const wide = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [columnLetter(i + 1), "y".repeat(600)]));
    const sheet: Sheet = { name: "Wide", rowCount: 1, rows: new Map([[1, wide]]), links: [] };
    expect(sheetExcerpt(sheet).split("\n")[1]!.split(" | ")).toHaveLength(60);
    const cells = sheetPreview(sheet).rows[0]!.cells;
    expect(Object.keys(cells)).toHaveLength(100);
    expect(cells.A).toBe(`${"y".repeat(500)}…`);
  });
});
