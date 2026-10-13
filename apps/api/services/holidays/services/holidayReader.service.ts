import Anthropic from "@anthropic-ai/sdk";
import { secret } from "encore.dev/config";
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import type { HolidayReadResult as ReadResult } from "../interfaces/interfaces";
import { HOLIDAY_KEYS, type HolidayRow, cleanRow, isUsableRow, parseRowsJson } from "../lib/rows";
import { parseCsv, readWorkbook, rowsFromTable, toText } from "../lib/spreadsheet";

const anthropicApiKey = secret("ANTHROPIC_API_KEY");
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

const IMAGE_TYPES: Record<string, "image/png" | "image/jpeg" | "image/gif" | "image/webp"> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};


const PROMPT = `You read public holiday lists (tables, calendars, screenshots, spreadsheets) and return them as data.
Return ONLY a JSON array. One object per holiday, with exactly these keys:
${HOLIDAY_KEYS.map((k) => `- "${k}"`).join("\n")}
Rules:
- A holiday observed in the whole country goes in nationalHoliday / nationalStart / nationalEnd; leave the regional fields "".
- A holiday observed only in some regions goes in regionalHoliday / regionalStart / regionalEnd, with the region names (comma separated) in "regions"; leave the national fields "".
- Dates as YYYY-MM-DD. A one-day holiday has the same start and end date. If the year is not written, use the year the document is about.
- "country" is the country name in English, "countryCode" its ISO 3166-1 alpha-2 code.
- Holiday names in English where the source gives them in English; otherwise as written.
- Use "" for anything not given. Do not invent holidays that are not in the source.`;

function client(): Anthropic {
  return new Anthropic({ apiKey: anthropicApiKey() || process.env.ANTHROPIC_API_KEY });
}

async function askModel(content: Anthropic.ContentBlockParam[]): Promise<{ rows: HolidayRow[]; truncated: boolean }> {
  let message: Anthropic.Message;
  try {
    message = await client()
      .messages.stream({ model: MODEL, max_tokens: 32000, system: PROMPT, messages: [{ role: "user", content }] })
      .finalMessage();
  } catch (err) {
    log.error(err, "holiday file: AI read failed", { model: MODEL });
    throw APIError.unavailable("The AI could not read the file. Try again, or upload it as a spreadsheet.");
  }
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return {
    rows: parseRowsJson(text).map(cleanRow).filter(isUsableRow),
    truncated: message.stop_reason === "max_tokens",
  };
}

// Tables the headers didn't match are sent to the model as text, in chunks it can answer in full.
async function rowsViaModelFromTables(tables: unknown[][][]): Promise<ReadResult> {
  const rows: HolidayRow[] = [];
  let truncated = false;
  for (const table of tables) {
    for (let i = 0; i < table.length; i += 150) {
      const chunk = (i > 0 ? [table[0]!] : []).concat(table.slice(i, i + 150));
      const res = await askModel([{ type: "text", text: `Spreadsheet rows (tab separated):\n${toText(chunk)}` }]);
      rows.push(...res.rows);
      truncated ||= res.truncated;
    }
  }
  return { rows, method: "ai", warning: truncated ? "The file was long; some rows may be missing — check the result." : undefined };
}

export async function readHolidayFile(fileBase64: string, fileName: string): Promise<ReadResult> {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const buffer = Buffer.from(fileBase64, "base64");

  if (ext === "xlsx" || ext === "xlsm") {
    const tables = await readWorkbook(buffer);
    const direct = tables.map(rowsFromTable).filter((r): r is HolidayRow[] => r !== null);
    if (direct.length) return { rows: direct.flat(), method: "spreadsheet" };
    return rowsViaModelFromTables(tables.filter((t) => t.length));
  }
  if (ext === "csv" || ext === "txt") {
    const table = parseCsv(buffer.toString("utf8"));
    const direct = rowsFromTable(table);
    if (direct) return { rows: direct, method: "spreadsheet" };
    return rowsViaModelFromTables([table]);
  }
  if (ext === "pdf") {
    const res = await askModel([
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } },
      { type: "text", text: "Extract every holiday in this document." },
    ]);
    return { rows: res.rows, method: "ai", warning: res.truncated ? "The file was long; some rows may be missing — check the result." : undefined };
  }
  if (IMAGE_TYPES[ext]) {
    const res = await askModel([
      { type: "image", source: { type: "base64", media_type: IMAGE_TYPES[ext]!, data: fileBase64 } },
      { type: "text", text: "Extract every holiday in this image." },
    ]);
    return { rows: res.rows, method: "ai", warning: res.truncated ? "The image held more than could be read at once; some rows may be missing." : undefined };
  }
  throw APIError.invalidArgument("Unsupported file. Use Excel (.xlsx), CSV, PDF, PNG, JPG, GIF or WEBP.");
}
