// What a stored file is for the app's one preview (hooks/useFilePreview.tsx): decided from its own
// bytes first, then its name and the type it was stored with. The type a server hands out is not
// enough on its own - most stores keep what the browser claimed at upload, and anything the API does
// not show inline comes as application/octet-stream (apps/api/lib/fileContent.ts).

import { formatDate } from "@/lib/date";

/** How a file is shown: in a frame (PDF), as a picture, as text, as a table, as a Word page, as sheets - or not at all. */
export type PreviewKind = "pdf" | "image" | "text" | "csv" | "docx" | "xlsx" | "none";

export interface PreviewType {
  kind: PreviewKind;
  /** The type the bytes are shown as (a PDF frame or a picture needs the right one). */
  mime: string;
}

const startsWith = (b: Uint8Array, bytes: number[], at = 0) => bytes.every((x, i) => b[at + i] === x);

/** Where "%PDF-" starts within the first KB (some writers put a byte order mark or a line before it), or -1. */
const pdfStart = (b: Uint8Array) => {
  for (let i = 0; i <= Math.min(1024, b.length - 5); i++) if (startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d], i)) return i;
  return -1;
};

/** A BMP's header, not just text that starts with "BM" (a container code like "BMOU…", say). */
const isBmp = (b: Uint8Array) =>
  startsWith(b, [0x42, 0x4d]) && startsWith(b, [0, 0, 0, 0], 6) && [12, 40, 52, 56, 108, 124].includes(b[14]! | (b[15]! << 8));

/** What the first bytes say a file is, for the types that carry a signature. */
export function sniffBytes(b: Uint8Array): "pdf" | "png" | "jpeg" | "gif" | "webp" | "bmp" | "tiff" | "heic" | "zip" | "ole" | null {
  if (pdfStart(b) >= 0) return "pdf";
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(b, [0x47, 0x49, 0x46, 0x38])) return "gif";
  if (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  if (isBmp(b)) return "bmp";
  // Scans: only Safari draws TIFF; elsewhere the dialog falls back to Download.
  if (startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a])) return "tiff";
  // ISO BMFF "ftyp" box with a HEIF brand (phone photos).
  if (startsWith(b, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brand = String.fromCharCode(...b.subarray(8, 12));
    if (["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(brand)) return "heic";
  }
  // Word, Excel and other Office files of today are ZIP archives; the old .doc / .xls / Outlook .msg are OLE.
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) return "zip";
  if (startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole";
  return null;
}

const IMAGE_MIME = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tiff: "image/tiff",
  heic: "image/heic",
} as const;

/** The file name's extension, lower case, without the dot ("" when it has none). */
export const extensionOf = (fileName: string) => {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 && dot < fileName.length - 1 ? fileName.slice(dot + 1).toLowerCase() : "";
};

const TEXT_EXTENSIONS = ["txt", "log", "json", "xml", "md", "eml", "edi", "ini", "yaml", "yml"];
const CSV_EXTENSIONS = ["csv", "tsv"];
const DOCX_EXTENSIONS = ["docx", "docm", "dotx"];
const XLSX_EXTENSIONS = ["xlsx", "xlsm", "xltx"];

/** Text saved as UTF-16 (Excel's "Unicode Text", some XML) starts with its byte order mark. */
const isUtf16 = (b: Uint8Array) => startsWith(b, [0xff, 0xfe]) || startsWith(b, [0xfe, 0xff]);

/** Whether the bytes read as text: UTF-16 with its mark, or no zero byte in what was looked at. */
const looksLikeText = (b: Uint8Array) => isUtf16(b) || !b.subarray(0, 4096).includes(0);

/**
 * How a file is shown, from its first bytes (`head`, a few KB are enough), its name and the type it
 * was stored or served with. A signature wins over the name, so a PDF stored as "octet-stream" or
 * named ".bin" is still shown as one, and a ".pdf" that is no PDF is not put in a PDF frame.
 */
export function previewTypeOf(head: Uint8Array, fileName: string, storedType = ""): PreviewType {
  const sniffed = sniffBytes(head);
  const ext = extensionOf(fileName);
  const type = storedType.toLowerCase().split(";")[0]!.trim();
  if (sniffed === "pdf") return { kind: "pdf", mime: "application/pdf" };
  if (sniffed && sniffed in IMAGE_MIME) return { kind: "image", mime: IMAGE_MIME[sniffed as keyof typeof IMAGE_MIME] };
  if (sniffed === "zip") {
    if (DOCX_EXTENSIONS.includes(ext) || type.includes("wordprocessingml")) return { kind: "docx", mime: "application/octet-stream" };
    if (XLSX_EXTENSIONS.includes(ext) || type.includes("spreadsheetml")) return { kind: "xlsx", mime: "application/octet-stream" };
    return { kind: "none", mime: "application/octet-stream" };
  }
  if (sniffed === "ole") return { kind: "none", mime: "application/octet-stream" };
  // SVG only ever as a picture (an <img> runs nothing in it), never as a page of the app.
  if (ext === "svg" || type === "image/svg+xml") return { kind: "image", mime: "image/svg+xml" };
  if (!looksLikeText(head)) return { kind: "none", mime: "application/octet-stream" };
  if (CSV_EXTENSIONS.includes(ext) || type === "text/csv" || type === "text/tab-separated-values") return { kind: "csv", mime: "text/csv" };
  if (TEXT_EXTENSIONS.includes(ext) || type === "text/plain" || type === "application/json" || type === "application/xml" || type === "text/xml") {
    return { kind: "text", mime: "text/plain" };
  }
  // Anything else (HTML among it) is only ever a download, never something the app's page loads.
  return { kind: "none", mime: "application/octet-stream" };
}

/** The bytes without a UTF-8 sequence cut off at their end (a 2 MB cut can fall inside "ň"). */
const withoutCutCharacter = (bytes: Uint8Array) => {
  let end = bytes.length;
  // Step back over continuation bytes (10xxxxxx) to the lead byte of the last character.
  let i = end - 1;
  while (i >= 0 && i > end - 4 && (bytes[i]! & 0xc0) === 0x80) i--;
  if (i < 0) return bytes;
  const lead = bytes[i]!;
  const length = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1;
  if (length > 1 && end - i < length) end = i;
  return bytes.subarray(0, end);
};

/**
 * Text as a person wrote it: UTF-16 or UTF-8 by its byte order mark, else UTF-8 - or Windows-1250,
 * which Czech files saved by Excel or Notepad often are, when the bytes mostly don't read as UTF-8.
 * A stray byte or two in an otherwise UTF-8 file keeps it UTF-8. `cut`: the bytes are the start of a
 * longer file, so a character split by the cut is left out rather than read as a bad byte.
 */
export function decodeText(input: Uint8Array, cut = false): string {
  if (startsWith(input, [0xff, 0xfe])) return new TextDecoder("utf-16le").decode(input.subarray(2));
  if (startsWith(input, [0xfe, 0xff])) return new TextDecoder("utf-16be").decode(input.subarray(2));
  const bytes = cut ? withoutCutCharacter(input) : input;
  const utf8 = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
  const invalid = (utf8.match(/�/g) ?? []).length;
  if (invalid === 0) return utf8;
  const readable = (utf8.match(/[^\u0000-\u007F�]/g) ?? []).length;
  if (readable >= invalid * 4) return utf8;
  try {
    return new TextDecoder("windows-1250").decode(bytes);
  } catch {
    return utf8;
  }
}

/** How often each separator stands outside quotes in a line. */
const countOutsideQuotes = (line: string, delimiter: string) => {
  let count = 0;
  let quoted = false;
  for (const c of line) {
    if (c === '"') quoted = !quoted;
    else if (c === delimiter && !quoted) count++;
  }
  return count;
};

/**
 * The separator a delimited text uses, judged on its first lines: the one of ; tab , that splits
 * them most evenly. Excel in Czech saves ";" (its decimals have commas), so ";" wins a tie.
 */
export function delimiterOf(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "").slice(0, 10);
  let best = { delimiter: ",", score: 0 };
  for (const delimiter of [";", "\t", ","]) {
    const counts = lines.map((l) => countOutsideQuotes(l, delimiter));
    const first = counts[0] ?? 0;
    if (first === 0) continue;
    // Lines that split into the same number of fields as the first one, weighted by that number.
    const consistent = counts.filter((c) => c === first).length;
    const score = consistent * 100 + first;
    if (score > best.score) best = { delimiter, score };
  }
  return best.delimiter;
}

/**
 * Rows of a CSV / TSV text (RFC 4180: quoted fields may hold the separator, line breaks and doubled
 * quotes). At most `maxRows` rows are read.
 */
export function parseDelimited(text: string, delimiter = delimiterOf(text), maxRows = Infinity): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length && rows.length < maxRows; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if ((field !== "" || row.length > 0) && rows.length < maxRows) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** A spreadsheet cell's value as read from a file. */
export type SheetCell = string | number | boolean | Date | null | undefined;

/** Excel's day 0 (30.12.1899 UTC); a date before 2.1.1900 is a time of day or a duration, not a day. */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const FIRST_REAL_DAY = Date.UTC(1900, 0, 2);
const MINUTE = 60_000;

/**
 * A cell as Excel shows it, near enough for a preview: dates as DD.MM.YYYY (with the time when it
 * has one), a time or a duration as H:MM, numbers without floating-point noise (3*1.1 is 3.3).
 */
export function formatSheetCell(value: SheetCell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    const time = value.getTime();
    if (Number.isNaN(time)) return "";
    // A read date can be a hair before the minute (14:29:59.999 for 14:30).
    const rounded = Math.round(time / MINUTE) * MINUTE;
    if (rounded < FIRST_REAL_DAY) {
      const minutes = Math.round((rounded - EXCEL_EPOCH) / MINUTE);
      return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
    }
    const iso = new Date(rounded).toISOString();
    const day = formatDate(iso.slice(0, 10));
    const hhmm = iso.slice(11, 16);
    return hhmm === "00:00" ? day : `${day} ${hhmm}`;
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(Number(value.toPrecision(15)));
  return String(value);
}
