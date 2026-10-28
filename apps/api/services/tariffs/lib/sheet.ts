import ExcelJS from "exceljs";
import { APIError } from "encore.dev/api";
import { zipUnpackedBytes } from "../../../lib/zipSize";
import type { ColumnLetter, SheetPreview } from "../interfaces/interfaces";

// An uploaded tariff file as sheets of cells by row number and column letter, the way the layout
// names them. Empty cells are left out. A merged range keeps its value in its first cell, and down
// its first column: a place or terminal merged over several price rows belongs to each of them.
// A workbook is opened only when what it unpacks to is of a tariff's size, and read only up to a
// tariff's number of cells: a zip bomb or a sheet of a million rows is refused, not read.

export type CellValue = string | number | boolean | Date;

export interface Sheet {
  name: string;
  /** The last row number that holds a value */
  rowCount: number;
  rows: Map<number, Record<ColumnLetter, CellValue>>;
  links: { address: string; text: string; url: string }[];
  /** A sheet Excel does not show; read only when asked for (readSheets' hidden option) */
  hidden?: boolean;
  /** The formulas of cells that have one, as Excel writes them ("=IF(B6>350,…)"), for the AI to see the tariff's rules */
  formulas?: Map<number, Record<ColumnLetter, string>>;
  /** The currency a number cell's format shows ("$"#,##0 → USD, #,##0 [$€-407] → EUR): a tariff may say it nowhere else */
  currencies?: Map<number, Record<ColumnLetter, string>>;
}

export interface ReadOptions {
  /** Hidden sheets too: a tariff may keep its postcode or distance lists there. */
  hidden?: boolean;
}

/** 1 → "A", 27 → "AA". */
export function columnLetter(n: number): ColumnLetter {
  let letter = "";
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) letter = String.fromCharCode(65 + ((i - 1) % 26)) + letter;
  return letter;
}

/** "A" → 1, "AA" → 27. */
export function columnIndex(letter: ColumnLetter): number {
  return [...letter.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}

/** A cell as one line of text: dates as YYYY-MM-DD, line breaks as spaces. */
export function cellText(v: CellValue | undefined): string {
  if (v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/\s*\r?\n\s*/g, " ").trim();
}

// A cell's value as plain data: formulas give their result, rich text and links their text.
function cellValue(v: ExcelJS.CellValue): CellValue | undefined {
  if (v == null) return undefined;
  if (v instanceof Date || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return v.trim() ? v : undefined;
  if (typeof v === "object") {
    if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
    if ("richText" in v) return cellValue(v.richText.map((t) => t.text).join(""));
    if ("text" in v) return cellValue(String(v.text));
    if ("error" in v) return String(v.error);
  }
  return undefined;
}

// The currency a number format shows, as an ISO code; undefined when it shows none.
function formatCurrency(numFmt: string | undefined): string | undefined {
  if (!numFmt) return undefined;
  if (/€|\[\$EUR/i.test(numFmt)) return "EUR";
  if (/K[čc]|\[\$CZK/i.test(numFmt)) return "CZK";
  if (/£|\[\$GBP/i.test(numFmt)) return "GBP";
  if (/\$|\[\$USD/i.test(numFmt)) return "USD";
  return undefined;
}

// A cell's formula as Excel writes it; a shared one as its master cell's.
function cellFormula(v: ExcelJS.CellValue): string | undefined {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("formula" in v && v.formula) return `=${v.formula}`;
    if ("sharedFormula" in v && v.sharedFormula) return `=(as ${v.sharedFormula})`;
  }
  return undefined;
}

/** What a workbook may unpack to, as its zip directory declares it: a tariff is a few MB unpacked. */
export const MAX_UNPACKED_BYTES = 100 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 5000;
/** The most cells a file is read into: many times any tariff's, few enough to keep the server well. */
const MAX_CELLS = 2_000_000;
/** The most links kept of a sheet; the AI is shown them, and a tariff has a handful. */
const MAX_LINKS = 50;

const OLD_XLS = "This is an old Excel 97–2003 (.xls) file. Open it in Excel, save it as Excel Workbook (.xlsx) and upload that.";
const NOT_A_WORKBOOK = "The file could not be read as a spreadsheet. Save it as .xlsx in Excel and upload it again.";

/** Refuses a file that is no .xlsx, or one that would unpack to far more than a tariff does. */
function checkWorkbookSize(buffer: Buffer): void {
  if (buffer.length >= 4 && buffer.readUInt32BE(0) === 0xd0cf11e0) throw APIError.invalidArgument(OLD_XLS);
  const unpacked = buffer.length >= 4 && buffer.readUInt32BE(0) === 0x504b0304 ? zipUnpackedBytes(buffer, { maxEntries: MAX_ZIP_ENTRIES, maxBytes: MAX_UNPACKED_BYTES }) : null;
  if (unpacked === null) throw APIError.invalidArgument(NOT_A_WORKBOOK);
  if (unpacked > MAX_UNPACKED_BYTES) {
    throw APIError.invalidArgument("The workbook unpacks to more than 100 MB. Remove pictures and the sheets the tariff does not need, save it again and upload it.");
  }
}

const tooManyCells = () =>
  APIError.invalidArgument(`The file has more than ${MAX_CELLS.toLocaleString("en-US")} filled cells. Remove the sheets the tariff does not need and upload it again.`);

async function readWorkbook(buffer: Buffer, options: ReadOptions): Promise<Sheet[]> {
  checkWorkbookSize(buffer);
  const wb = new ExcelJS.Workbook();
  // ExcelJS types load() with its own Buffer; a fresh ArrayBuffer copy fits it without a cast.
  await wb.xlsx.load(new Uint8Array(buffer).buffer);
  let cellCount = 0;
  return wb.worksheets
    .filter((ws) => ws.state === "visible" || options.hidden)
    .map((ws) => {
      const sheet: Sheet = { name: ws.name, rowCount: 0, rows: new Map(), links: [], ...(ws.state !== "visible" ? { hidden: true } : {}) };
      const formulas = new Map<number, Record<ColumnLetter, string>>();
      const currencies = new Map<number, Record<ColumnLetter, string>>();
      ws.eachRow({ includeEmpty: false }, (row, rowNo) => {
        const cells: Record<ColumnLetter, CellValue> = {};
        row.eachCell({ includeEmpty: false }, (cell, colNo) => {
          if (++cellCount > MAX_CELLS) throw tooManyCells();
          const copy = cell.isMerged && cell.master.address !== cell.address;
          if (copy && cell.master.col !== cell.col) return;
          const formula = copy ? undefined : cellFormula(cell.value);
          if (formula) formulas.set(rowNo, { ...formulas.get(rowNo), [columnLetter(colNo)]: formula });
          const value = cellValue(copy ? cell.master.value : cell.value);
          if (value === undefined) return;
          cells[columnLetter(colNo)] = value;
          const currency = typeof value === "number" ? formatCurrency(cell.numFmt) : undefined;
          if (currency) currencies.set(rowNo, { ...currencies.get(rowNo), [columnLetter(colNo)]: currency });
          if (cell.hyperlink && !copy && sheet.links.length < MAX_LINKS) sheet.links.push({ address: cell.address, text: cellText(value), url: cell.hyperlink });
        });
        if (Object.keys(cells).length) {
          sheet.rows.set(rowNo, cells);
          sheet.rowCount = rowNo;
        }
      });
      if (formulas.size) sheet.formulas = formulas;
      if (currencies.size) sheet.currencies = currencies;
      return sheet;
    })
    .filter((sheet) => sheet.rows.size > 0);
}

// A CSV file into rows of cells, one per line as Excel numbers them (blank ones too): ; or , as the
// separator (whichever the first line has more of), "" quotes, line breaks inside quotes kept.
function parseCsv(text: string): string[][] {
  const body = text.replace(/^\ufeff/, "");
  const firstLine = body.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const sep = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  if (cur || row.length) rows.push([...row, cur]);
  return rows;
}

// A CSV file's text: UTF-8, or else the Windows code page Czech Excel saves in.
function csvText(buffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1250").decode(buffer);
  }
}

function csvSheet(name: string, table: string[][]): Sheet {
  const sheet: Sheet = { name, rowCount: 0, rows: new Map(), links: [] };
  let cellCount = 0;
  table.forEach((values, i) => {
    const cells: Record<ColumnLetter, CellValue> = {};
    values.forEach((v, c) => {
      if (!v.trim()) return;
      if (++cellCount > MAX_CELLS) throw tooManyCells();
      cells[columnLetter(c + 1)] = v.trim();
    });
    if (Object.keys(cells).length) {
      sheet.rows.set(i + 1, cells);
      sheet.rowCount = i + 1;
    }
  });
  return sheet;
}

/** The visible (with `hidden`, all), non-empty sheets of an uploaded .xlsx/.xlsm or .csv file. */
export async function readSheets(buffer: Buffer, fileName: string, options: ReadOptions = {}): Promise<Sheet[]> {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "xlsx" || ext === "xlsm") return readWorkbook(buffer, options);
  if (ext === "csv" || ext === "txt") {
    const sheet = csvSheet(fileName.replace(/\.[^.]+$/, ""), parseCsv(csvText(buffer)));
    return sheet.rows.size ? [sheet] : [];
  }
  throw APIError.invalidArgument("Upload the tariff as an Excel file (.xlsx) or a CSV file. An old .xls file can be saved as .xlsx in Excel first.");
}

const sortedRowNos = (sheet: Sheet) => [...sheet.rows.keys()].sort((a, b) => a - b);

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

// A row's cells as text, left to right: at most `maxCells` of them, each of at most `maxChars`.
const rowTexts = (cells: Record<ColumnLetter, CellValue>, maxCells: number, maxChars: number): Record<ColumnLetter, string> => {
  const out: Record<ColumnLetter, string> = {};
  const columns = Object.keys(cells).sort((a, b) => columnIndex(a) - columnIndex(b));
  for (const col of columns.slice(0, maxCells)) {
    const text = cellText(cells[col]);
    if (text) out[col] = clip(text, maxChars);
  }
  return out;
};

// A preview row: a price table's columns are well within these; a sheet far wider is cut.
const PREVIEW_CELLS = 100;
const PREVIEW_CELL_CHARS = 500;

/** The first rows as text, for setting up the layout by hand. */
export function sheetPreview(sheet: Sheet, maxRows = 30): SheetPreview {
  return {
    name: sheet.name,
    rowCount: sheet.rowCount,
    rows: sortedRowNos(sheet)
      .slice(0, maxRows)
      .map((rowNo) => ({ rowNo, cells: rowTexts(sheet.rows.get(rowNo)!, PREVIEW_CELLS, PREVIEW_CELL_CHARS) })),
  };
}

const HEAD_ROWS = 40;
const SAMPLED_ROWS = 15;
const RARE_ROWS = 10;
// What one row shows the AI: the cells of a tariff's widest table, each cut short.
const EXCERPT_CELLS = 60;
const MAX_CELL_CHARS = 200;
const MAX_FORMULA_CHARS = 120;

// A row as the AI reads it; with `formulas`, a computed cell also shows its formula: {=…}; a
// number formatted as money shows its currency: [USD].
const rowLine = (rowNo: number, cells: Record<ColumnLetter, CellValue>, formulas?: Record<ColumnLetter, string>, currencies?: Record<ColumnLetter, string>) =>
  `R${rowNo}: ` +
  Object.entries(rowTexts(cells, EXCERPT_CELLS, MAX_CELL_CHARS))
    .map(
      ([col, text]) =>
        `${col}=${text}${currencies?.[col] ? ` [${currencies[col]}]` : ""}${formulas?.[col] ? ` {${clip(formulas[col]!, MAX_FORMULA_CHARS)}}` : ""}`,
    )
    .join(" | ");

/**
 * What the AI reads to work out a sheet's layout: its size, the first rows (title, terms, headings,
 * the first prices), rows sampled from the rest, rows using a column that is nearly always empty
 * (notes), and the links. Short, as it is sent to the model. With `formulas`, the first rows' computed
 * cells show their formulas too: a calculator sheet keeps the tariff's rules in them.
 */
export function sheetExcerpt(sheet: Sheet, options: { formulas?: boolean } = {}): string {
  const rowNos = sortedRowNos(sheet);
  const head = rowNos.slice(0, HEAD_ROWS);
  const rest = rowNos.slice(HEAD_ROWS);

  const step = rest.length / SAMPLED_ROWS;
  const sampled = new Set(rest.length <= SAMPLED_ROWS ? rest : Array.from({ length: SAMPLED_ROWS }, (_, i) => rest[Math.floor(i * step)]!));

  // A column filled in fewer than 10% of the rows (a notice, a remark) shows where the exceptions are.
  const filled = new Map<ColumnLetter, number>();
  for (const r of rowNos) for (const col of Object.keys(sheet.rows.get(r)!)) filled.set(col, (filled.get(col) ?? 0) + 1);
  const lastColumn = [...filled.keys()].reduce((last, col) => Math.max(last, columnIndex(col)), 1);
  const rare = new Set([...filled].filter(([, n]) => n < rowNos.length * 0.1).map(([col]) => col));
  const rareRows = rest.filter((r) => !sampled.has(r) && Object.keys(sheet.rows.get(r)!).some((col) => rare.has(col))).slice(0, RARE_ROWS);

  const lines = [`Sheet "${sheet.name}"${sheet.hidden ? " (hidden)" : ""}: ${sheet.rowCount} rows, columns A–${columnLetter(lastColumn)}`];
  lines.push(...head.map((r) => rowLine(r, sheet.rows.get(r)!, options.formulas ? sheet.formulas?.get(r) : undefined, sheet.currencies?.get(r))));
  if (rest.length) {
    lines.push(`… rows ${rest[0]}–${rest[rest.length - 1]}: a sample, and the rows using rarely filled columns:`);
    const more = [...new Set([...sampled, ...rareRows])].sort((a, b) => a - b);
    lines.push(...more.map((r) => rowLine(r, sheet.rows.get(r)!, undefined, sheet.currencies?.get(r))));
  }
  if (sheet.links.length) {
    lines.push("Links:");
    lines.push(...sheet.links.map((l) => `${l.address}: ${clip(l.text, MAX_CELL_CHARS)} → ${clip(l.url, MAX_CELL_CHARS)}`));
  }
  return lines.join("\n");
}
