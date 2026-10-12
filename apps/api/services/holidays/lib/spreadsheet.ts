import ExcelJS from "exceljs";
import { type HolidayRow, cleanRow, isUsableRow, mapHeaders } from "./rows";

// Spreadsheet files (xlsx, csv) as plain tables of cell values.

// Cell value as plain data: dates stay Dates, formulas/rich text give their result.
function cellValue(v: ExcelJS.CellValue): unknown {
  if (v == null) return "";
  if (v instanceof Date || typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "object") {
    if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
  }
  return String(v);
}

export async function readWorkbook(buffer: Buffer): Promise<unknown[][][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as never);
  return wb.worksheets.map((ws) => {
    const rows: unknown[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values as ExcelJS.CellValue[]; // 1-based
      rows.push(values.slice(1).map(cellValue));
    });
    return rows;
  });
}

export function parseCsv(text: string): unknown[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const sep = (lines[0]?.split(";").length ?? 0) > (lines[0]?.split(",").length ?? 0) ? ";" : ",";
  return lines.map((line) => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === sep && !quoted) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  });
}

// A sheet whose header row matches the holiday columns is read as-is, no AI needed.
export function rowsFromTable(table: unknown[][]): HolidayRow[] | null {
  for (let h = 0; h < Math.min(table.length, 10); h++) {
    const map = mapHeaders(table[h]!.map((c) => (c instanceof Date ? "" : String(c ?? ""))));
    if (!map) continue;
    return table
      .slice(h + 1)
      .map((cells) => {
        const raw: Partial<Record<keyof HolidayRow, unknown>> = {};
        for (const [i, field] of map) raw[field] = cells[i];
        return cleanRow(raw);
      })
      .filter(isUsableRow);
  }
  return null;
}

export const toText = (table: unknown[][]) =>
  table.map((cells) => cells.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? ""))).join("\t")).join("\n");

