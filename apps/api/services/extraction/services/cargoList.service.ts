import type Anthropic from "@anthropic-ai/sdk";
import { APIError } from "encore.dev/api";
import { askAi, MODEL, replyText } from "../lib/anthropic";
import {
  CARGO_LIST_PROMPT,
  MAX_CARGO_LINES,
  MAX_CARGO_TEXT,
  UNREADABLE_CARGO_FILE,
  cargoEntriesOfReply,
  cargoFileKind,
  cargoFileProblem,
  cargoLinesOfReply,
  cargoTextOfFile,
  workbookText,
  type CargoLineRead,
} from "../lib/cargoList";
import { detectMediaType, extractTextFromPdf } from "../lib/pdf";
import { chargeReading } from "../lib/readingBudget";

// A reply of 200 lines runs to about 80 tokens a line with its keys and a note. One attempt may
// then take up to about 8 minutes (lib/anthropic replyTimeoutMs); a list that is longer still is
// cut off, and what came whole is kept (cargoEntriesOfReply).
const MAX_TOKENS = 16_000;

export interface CargoListRead {
  lines: CargoLineRead[];
  /** The document was longer than one reading takes, or the reply was cut off: lines may be missing. */
  partial: boolean;
}

/** What is to be read: a pasted text, or a file. */
export interface CargoListSource {
  text?: string;
  fileBase64?: string;
  fileName?: string;
}

/** Called once, right before the first paid reading: it counts the reading, and may refuse it. */
type BeforeAi = () => void;

// One reading. `replyCut` says the reply ran into its length limit: the document did hold cargo,
// only more of it than one reply takes.
async function ask(content: Anthropic.MessageParam["content"], textCut: boolean): Promise<{ read: CargoListRead; replyCut: boolean }> {
  const response = await askAi({ model: MODEL, max_tokens: MAX_TOKENS, system: CARGO_LIST_PROMPT, messages: [{ role: "user", content }] }, "cargo list reading");
  const { entries, whole } = cargoEntriesOfReply(replyText(response));
  const replyCut = response.stop_reason === "max_tokens";
  const lines = cargoLinesOfReply(entries);
  const overfull = lines.length === MAX_CARGO_LINES && entries.length > MAX_CARGO_LINES;
  return { read: { lines, partial: textCut || replyCut || !whole || overfull }, replyCut };
}

const askText = (text: string) => ask(`Extract the cargo lines from this document.\n\n---\n${text.slice(0, MAX_CARGO_TEXT)}\n---`, text.length > MAX_CARGO_TEXT);

/** A cargo list given as text: pasted, or the text of a file. */
export async function readCargoText(text: string, beforeAi: BeforeAi): Promise<CargoListRead> {
  beforeAi();
  return (await askText(text)).read;
}

async function viaVision(fileBase64: string, mediaType: string): Promise<CargoListRead> {
  const media: Anthropic.ContentBlockParam =
    mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } }
      : { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: fileBase64 } };
  return (await ask([media, { type: "text", text: "Extract the cargo lines from this document." }], false)).read;
}

/**
 * A cargo list given as a file: a PDF (its text, or the page itself when it is a scan), a picture,
 * an .xlsx workbook or a text file. Whatever can be refused without the AI - a kind that is not
 * read, a workbook that cannot be opened or is far too large - is refused before `beforeAi`.
 */
export async function readCargoFile(fileBase64: string, fileName: string, beforeAi: BeforeAi): Promise<CargoListRead> {
  const buffer = Buffer.from(fileBase64, "base64");
  switch (cargoFileKind(fileName)) {
    case "image":
      beforeAi();
      return viaVision(fileBase64, detectMediaType(fileName));
    case "pdf": {
      const text = await extractTextFromPdf(buffer);
      // One reading, even when the page is read again as a picture below.
      beforeAi();
      // A scan has no text to speak of: the page is read as a picture.
      if (text.trim().length < 40) return viaVision(fileBase64, "application/pdf");
      const { read, replyCut } = await askText(text);
      // No line in the text: the list may be a picture on the page, so the page itself is read.
      // Not when the reply was merely cut off - then the text did hold cargo, and a second paid
      // reading would be cut off the same way.
      return read.lines.length > 0 || replyCut ? read : viaVision(fileBase64, "application/pdf");
    }
    case "xlsx":
      return readCargoText(await workbookText(buffer), beforeAi);
    case "text":
      return readCargoText(cargoTextOfFile(buffer), beforeAi);
    default:
      throw APIError.invalidArgument(UNREADABLE_CARGO_FILE);
  }
}

/**
 * The Loading Planner's reader: the cargo lines of a file or of a pasted text, for `userId`. One
 * paid Claude reading, counted against the user's hourly reading budget - but only once nothing is
 * left that could be refused without asking the AI (the kind and size of a file, a workbook that
 * cannot be opened), so a refused file costs the user nothing.
 */
export async function readCargoList(userId: string, source: CargoListSource): Promise<CargoListRead> {
  const text = source.text?.trim() ?? "";
  const hasFile = !!source.fileBase64 && !!source.fileName;
  if (hasFile === text.length > 0) throw APIError.invalidArgument("Choose a file or paste a text, not both.");
  if (!hasFile && text.length < 10) throw APIError.invalidArgument("The text is too short to hold a cargo list.");
  const charge = () => chargeReading(userId, 1);
  if (!hasFile) return readCargoText(text, charge);
  const problem = cargoFileProblem(source.fileName!, source.fileBase64!);
  if (problem) throw APIError.invalidArgument(problem);
  return readCargoFile(source.fileBase64!, source.fileName!, charge);
}
