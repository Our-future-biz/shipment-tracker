import ExcelJS from "exceljs";

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

export const CARGO_LIST_PROMPT = `You read cargo lists for a freight forwarder: packing lists, quote requests, e-mails, spreadsheets. Extract every kind of piece the document lists, so that a container loading plan can be made.

Return ONLY a JSON object of this shape, with no other text:
{"lines":[{"name":"...","lengthMm":0,"widthMm":0,"heightMm":0,"weightKg":0,"colli":0,"stackable":null,"note":""}]}

Rules:
- One line per kind of piece. Pieces of the same size and weight are one line with "colli" = how many there are.
- "name": what the piece is, as the document calls it (e.g. "Pallet", "Wooden case no. 4", "Transformer"). Keep it short.
- "lengthMm", "widthMm", "heightMm": the size of ONE piece in millimetres, as whole numbers. Convert from the unit the document uses (cm x 10, m x 1000, inches x 25.4). Keep the order the document gives: length x width x height.
- "weightKg": the gross weight of ONE piece in kilograms. Convert tonnes to kg. If the document gives only the total weight of a line of several pieces, divide it by the number of pieces and say so in "note".
- "colli": the number of pieces, a whole number.
- "stackable": true or false only if the document says so; otherwise null.
- NEVER invent a value. If the document does not give a size, a weight or a count, use null for it.
- If the unit of the sizes or of the weight is not written and you had to assume it, say which unit you assumed in "note".
- "note": at most one short sentence, in English; "" when there is nothing to say.
- Ignore totals rows, prices, addresses and anything that is not a piece of cargo.
- If the document lists no cargo, return {"lines":[]}.`;

const positive = (value: unknown, max: number): number | null => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 && n <= max ? n : null;
};
const whole = (value: number | null): number | null => (value === null ? null : Math.max(1, Math.round(value)));

/** The lines of the AI's reply, checked: figures that are not usable numbers become null, and a line with nothing in it is dropped. */
export function cargoLinesOfReply(reply: Record<string, unknown> | null): CargoLineRead[] {
  const raw = Array.isArray(reply?.lines) ? (reply.lines as unknown[]) : [];
  const lines: CargoLineRead[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const line: CargoLineRead = {
      name: typeof e.name === "string" ? e.name.trim().slice(0, 120) : "",
      lengthMm: whole(positive(e.lengthMm, 100_000)),
      widthMm: whole(positive(e.widthMm, 100_000)),
      heightMm: whole(positive(e.heightMm, 100_000)),
      weightKg: positive(e.weightKg, 1_000_000),
      colli: whole(positive(e.colli, 2000)),
      stackable: typeof e.stackable === "boolean" ? e.stackable : null,
      note: typeof e.note === "string" ? e.note.trim().slice(0, 200) : "",
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

/** A workbook (.xlsx) as text the AI can read: each sheet under its name, a row per line, cells separated by tabs. */
export async function workbookText(buffer: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as never);
  const sheets = wb.worksheets.map((ws) => {
    const rows: string[] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells = (row.values as ExcelJS.CellValue[]).slice(1).map(cellText);
      if (cells.some((cell) => cell.trim())) rows.push(cells.join("\t"));
    });
    return rows.length > 0 ? `Sheet "${ws.name}":\n${rows.join("\n")}` : "";
  });
  return sheets.filter(Boolean).join("\n\n");
}

/** The kind of file a cargo list comes as, by its name. */
export function cargoFileKind(fileName: string): "pdf" | "image" | "xlsx" | "text" | "unknown" {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  if (ext === "xlsx") return "xlsx";
  if (["csv", "txt", "tsv"].includes(ext)) return "text";
  return "unknown";
}
