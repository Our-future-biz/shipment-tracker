import { APIError } from "encore.dev/api";
import ExcelJS from "exceljs";
import { zipUnpackedBytes } from "../../../lib/zipSize";

// Reading a cargo list (a packing list, a quote request, a pasted e-mail) into the lines the
// Loading Planner plans with. The AI reads; this file holds what it is asked and how its answer is
// checked. Nothing is ever made up here: a figure the document does not give stays null.

/** One cargo line as read. Sizes in whole mm, weight in kg per piece; null where the document gives none. */
export interface CargoLineRead {
  name: string;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  weightKg: number | null;
  colli: number | null;
  /** true / false when the document says so; null when it does not. */
  stackable: boolean | null;
  /** What the reader assumed or could not tell, for the person checking the line. */
  note: string;
}

export const MAX_CARGO_LINES = 200;
/** As much text as one reading is sent. */
export const MAX_CARGO_TEXT = 20_000;

// What one line of a plan holds (the Loading Planner's own limits, loadingPlanner/lib/planInput).
const MAX_COLLI = 2000;
const MAX_SIZE_MM = 100_000;
const MAX_WEIGHT_KG = 1_000_000;

/** The largest file that is read, and the largest picture: the AI provider takes none over 5 MB. */
export const MAX_CARGO_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_CARGO_PICTURE_BYTES = 5 * 1024 * 1024;

// How far a workbook may unpack and how many filled cells are looked at: many times any packing
// list's, few enough to keep the server well.
const MAX_UNPACKED_BYTES = 50 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 5000;
const MAX_CELLS = 200_000;

export const CARGO_LIST_PROMPT = `You read cargo lists for a freight forwarder: packing lists, quote requests, e-mails, spreadsheets. Extract every kind of piece the document lists, so that a container loading plan can be made.

Return ONLY a JSON object of this shape, with no other text:
{"lines":[{"name":"...","lengthMm":0,"widthMm":0,"heightMm":0,"weightKg":0,"colli":0,"stackable":null,"note":""}]}

Rules:
- One line per kind of piece. Pieces of the same size and weight are one line with "colli" = how many there are.
- "name": what the piece is, as the document calls it (e.g. "Pallet", "Wooden case no. 4", "Transformer"). Keep it short.
- "lengthMm", "widthMm", "heightMm": the size of ONE piece in millimetres, as whole numbers. The document may give sizes in mm, cm, m, inches or feet: convert from the unit it uses (cm x 10, m x 1000, inches x 25.4, feet x 304.8). Keep the order the document gives: length x width x height.
- "weightKg": the gross weight of ONE piece in kilograms. The document may give weights in kg, tonnes or lbs: convert tonnes x 1000 and lbs x 0.4536. If the document gives only the total weight of a line of several pieces, divide it by the number of pieces and say so in "note".
- "colli": the number of pieces, a whole number.
- "stackable": true or false only if the document says so; otherwise null.
- Numbers: a comma between digits followed by one or two digits is a decimal comma ("1,5" is 1.5; "2,75 m" is 2.75 m). A comma or a dot followed by exactly three digits is a thousands separator when the figure would otherwise make no sense ("1,200 kg" and "1.200 kg" are 1200 kg). Never return a separator inside a number.
- A merged cell, a subtotal or a total that is repeated on several rows is NOT the weight of one piece, unless the document says it is per piece. When only such a total is given for a group of lines, leave "weightKg" null for them and say so in "note".
- NEVER invent a value. If the document does not give a size, a weight or a count, use null for it.
- If the unit of the sizes or of the weight is not written and you had to assume it, say which unit you assumed in "note".
- "note": at most one short sentence, in English; "" when there is nothing to say. Call the number of pieces "colli" in it.
- Ignore totals rows, prices, addresses and anything that is not a piece of cargo.
- If the document lists no cargo, return {"lines":[]}.`;

/** The sentence for a file whose kind is not read. */
export const UNREADABLE_CARGO_FILE = "This kind of file cannot be read. Use a PDF, a picture (PNG, JPG), an .xlsx workbook, or a .csv or .txt file.";

/** The kind of file a cargo list comes as, by its name. */
export function cargoFileKind(fileName: string): "pdf" | "image" | "xlsx" | "text" | "unknown" {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  if (ext === "xlsx") return "xlsx";
  if (["csv", "txt", "tsv"].includes(ext)) return "text";
  return "unknown";
}

/**
 * Why a file cannot be read, as a sentence for the user, or null when it can be tried: its kind by
 * its name, and its size. Checked before a reading is counted or paid for.
 */
export function cargoFileProblem(fileName: string, fileBase64: string): string | null {
  const kind = cargoFileKind(fileName);
  if (kind === "unknown") return UNREADABLE_CARGO_FILE;
  // Base64 writes three bytes as four characters.
  const bytes = Math.floor((fileBase64.length * 3) / 4);
  if (bytes > MAX_CARGO_FILE_BYTES) return "The file is larger than 20 MB. Send a smaller file, or paste the cargo list as text.";
  if (kind === "image" && bytes > MAX_CARGO_PICTURE_BYTES) return "The picture is larger than 5 MB. Save it smaller (a lower resolution or a JPG) and try again.";
  return null;
}

/**
 * A .csv or .txt file as text. Read as UTF-8; a file that is not (Excel on a Czech Windows saves
 * .csv in windows-1250) shows as replacement characters, and is then read as windows-1250.
 */
export function cargoTextOfFile(buffer: Buffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  return utf8.includes("�") ? new TextDecoder("windows-1250").decode(buffer) : utf8;
}

// The objects that stand whole and straight in a list (the reply's own list, or the one under
// "lines"), read one by one: what is left of a reply that was cut off in the middle of a line.
function completeObjects(text: string): unknown[] {
  const found: unknown[] = [];
  const open: string[] = [];
  let inString = false;
  let from = -1;
  let fromDepth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === "{" || c === "[") {
      if (c === "{" && from < 0 && open[open.length - 1] === "[") {
        from = i;
        fromDepth = open.length;
      }
      open.push(c);
    } else if (c === "}" || c === "]") {
      open.pop();
      if (c === "}" && from >= 0 && open.length === fromDepth) {
        try {
          found.push(JSON.parse(text.slice(from, i + 1)));
        } catch {
          // Not an object after all: left out.
        }
        from = -1;
      }
    }
  }
  return found;
}

const parsed = (text: string, opens: string, closes: string): unknown => {
  const start = text.indexOf(opens);
  const end = text.lastIndexOf(closes);
  if (start < 0 || end < start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
};

/**
 * The line entries of the AI's reply, unchecked. The reply is {"lines":[…]} as asked, or a bare
 * list of lines. One that is neither - cut off at the reply's length limit, as a long list is -
 * still gives every line it holds complete; `whole` is then false, for lines may be missing.
 */
export function cargoEntriesOfReply(text: string): { entries: unknown[]; whole: boolean } {
  const object = parsed(text, "{", "}");
  const isObject = !!object && typeof object === "object" && !Array.isArray(object);
  if (isObject && Array.isArray((object as Record<string, unknown>).lines)) return { entries: (object as { lines: unknown[] }).lines, whole: true };
  const list = parsed(text, "[", "]");
  if (Array.isArray(list)) return { entries: list, whole: true };
  // A whole object without lines says there are none.
  if (isObject) return { entries: [], whole: true };
  return { entries: completeObjects(text), whole: false };
}

const numberOf = (value: unknown): number => (typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN);
const figure = (n: number): string => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

// A figure as a plan line can hold it, or null with the sentence that says why not. Nothing given
// (absent, zero, not a number) is null without a word: that is simply missing.
interface Figure {
  value: number | null;
  note: string;
}
const MISSING: Figure = { value: null, note: "" };

function sizeOf(value: unknown, label: string): Figure {
  const n = numberOf(value);
  if (!Number.isFinite(n) || n <= 0) return MISSING;
  if (n > MAX_SIZE_MM) return { value: null, note: `The document says a ${label} of ${figure(n / 1000)} m: more than a plan line holds (100 m).` };
  // Never rounded up to 1 mm: that would be a size the document does not give.
  if (n < 1) return { value: null, note: `The document says a ${label} of less than 1 mm.` };
  return { value: Math.round(n), note: "" };
}

function weightOf(value: unknown): Figure {
  const n = numberOf(value);
  if (!Number.isFinite(n) || n <= 0) return MISSING;
  if (n > MAX_WEIGHT_KG) return { value: null, note: `The document says a weight of ${figure(n / 1000)} t a colli: more than a plan line holds (1,000 t).` };
  return { value: n, note: "" };
}

function colliOf(value: unknown): Figure {
  const n = numberOf(value);
  if (!Number.isFinite(n) || n <= 0) return MISSING;
  if (n > MAX_COLLI) return { value: null, note: `The document says ${figure(n)} colli: more than one plan line holds (${figure(MAX_COLLI)}).` };
  if (!Number.isInteger(n)) return { value: null, note: `The document says ${figure(n)} colli, which is not a whole number.` };
  return { value: n, note: "" };
}

/**
 * The lines of the AI's reply, checked: figures that are not usable numbers become null, a figure
 * a plan line cannot hold becomes null with a note that says what the document gives, and a line
 * with nothing in it is dropped.
 */
export function cargoLinesOfReply(entries: unknown[]): CargoLineRead[] {
  const lines: CargoLineRead[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const length = sizeOf(e.lengthMm, "length");
    const width = sizeOf(e.widthMm, "width");
    const height = sizeOf(e.heightMm, "height");
    const weight = weightOf(e.weightKg);
    const colli = colliOf(e.colli);
    const said = typeof e.note === "string" ? e.note.trim().slice(0, 200) : "";
    const line: CargoLineRead = {
      name: typeof e.name === "string" ? e.name.trim().slice(0, 120) : "",
      lengthMm: length.value,
      widthMm: width.value,
      heightMm: height.value,
      weightKg: weight.value,
      colli: colli.value,
      stackable: typeof e.stackable === "boolean" ? e.stackable : null,
      note: [said, length.note, width.note, height.note, weight.note, colli.note].filter(Boolean).join(" "),
    };
    const empty = !line.name && line.lengthMm === null && line.widthMm === null && line.heightMm === null && line.weightKg === null;
    if (!empty) lines.push(line);
    if (lines.length === MAX_CARGO_LINES) break;
  }
  return lines;
}

// Cell value as plain text: formulas and rich text give their result.
function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
    return "";
  }
  return String(v);
}

const NOT_A_WORKBOOK = "The Excel file could not be opened. Save it as .xlsx and try again.";

// Refuses a file that is no .xlsx, or one that would unpack to far more than a cargo list does -
// before the workbook reader unpacks it (lib/zipSize: the guard against a zip bomb).
function checkWorkbookSize(buffer: Buffer): void {
  if (buffer.length >= 4 && buffer.readUInt32BE(0) === 0xd0cf11e0) {
    throw APIError.invalidArgument("This is an old Excel 97–2003 (.xls) file. Open it in Excel, save it as Excel Workbook (.xlsx) and try again.");
  }
  const unpacked = buffer.length >= 4 && buffer.readUInt32BE(0) === 0x504b0304 ? zipUnpackedBytes(buffer, { maxEntries: MAX_ZIP_ENTRIES, maxBytes: MAX_UNPACKED_BYTES }) : null;
  if (unpacked === null) throw APIError.invalidArgument(NOT_A_WORKBOOK);
  if (unpacked > MAX_UNPACKED_BYTES) {
    throw APIError.invalidArgument("The workbook unpacks to more than 50 MB. Remove pictures and the sheets the cargo list does not need, save it again and try again.");
  }
}

/**
 * A workbook (.xlsx) as text the AI can read: each visible sheet under its name, a row per line,
 * cells separated by tabs. Rows are gathered only until there is more text than one reading takes
 * (MAX_CARGO_TEXT) - the rest would not be sent anyway. Refuses, with a sentence for the user, a
 * file that is no workbook or is far larger than a cargo list.
 */
export async function workbookText(buffer: Buffer): Promise<string> {
  checkWorkbookSize(buffer);
  const wb = new ExcelJS.Workbook();
  try {
    // ExcelJS types load() with its own Buffer; a fresh ArrayBuffer copy fits it without a cast.
    await wb.xlsx.load(new Uint8Array(buffer).buffer);
  } catch {
    throw APIError.invalidArgument(NOT_A_WORKBOOK);
  }
  const sheets: string[] = [];
  let gathered = 0;
  let cells = 0;
  for (const ws of wb.worksheets) {
    // A hidden sheet is not part of what the sender shows.
    if (ws.state !== "visible" || gathered > MAX_CARGO_TEXT) continue;
    const rows: string[] = [];
    for (let n = 1; n <= ws.rowCount && gathered <= MAX_CARGO_TEXT; n++) {
      const row = ws.findRow(n);
      if (!row) continue;
      cells += row.actualCellCount;
      if (cells > MAX_CELLS) {
        throw APIError.invalidArgument(`The workbook has more than ${MAX_CELLS.toLocaleString("en-US")} filled cells. Keep only the sheet with the cargo list and try again.`);
      }
      const texts = (row.values as ExcelJS.CellValue[]).slice(1).map(cellText);
      if (!texts.some((text) => text.trim())) continue;
      const line = texts.join("\t");
      rows.push(line);
      gathered += line.length + 1;
    }
    if (rows.length > 0) sheets.push(`Sheet "${ws.name}":\n${rows.join("\n")}`);
  }
  return sheets.join("\n\n");
}
