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
  cargoLinesOfReply,
  cargoTextOfFile,
  workbookText,
  type CargoLineRead,
} from "../lib/cargoList";
import { detectMediaType, extractTextFromPdf } from "../lib/pdf";

// A reply of 200 lines runs to about 80 tokens a line with its keys and a note. One attempt may
// then take up to about 8 minutes (lib/anthropic replyTimeoutMs); a list that is longer still is
// cut off, and what came whole is kept (cargoEntriesOfReply).
const MAX_TOKENS = 16_000;

export interface CargoListRead {
  lines: CargoLineRead[];
  /** The document was longer than one reading takes, or the reply was cut off: lines may be missing. */
  partial: boolean;
}

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
export async function readCargoText(text: string): Promise<CargoListRead> {
  return (await askText(text)).read;
}

async function viaVision(fileBase64: string, mediaType: string): Promise<CargoListRead> {
  const media: Anthropic.ContentBlockParam =
    mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } }
      : { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: fileBase64 } };
  return (await ask([media, { type: "text", text: "Extract the cargo lines from this document." }], false)).read;
}

/** A cargo list given as a file: a PDF (its text, or the page itself when it is a scan), a picture, an .xlsx workbook or a text file. */
export async function readCargoFile(fileBase64: string, fileName: string): Promise<CargoListRead> {
  const buffer = Buffer.from(fileBase64, "base64");
  switch (cargoFileKind(fileName)) {
    case "image":
      return viaVision(fileBase64, detectMediaType(fileName));
    case "pdf": {
      const text = await extractTextFromPdf(buffer);
      // A scan has no text to speak of: the page is read as a picture.
      if (text.trim().length < 40) return viaVision(fileBase64, "application/pdf");
      const { read, replyCut } = await askText(text);
      // No line in the text: the list may be a picture on the page, so the page itself is read.
      // Not when the reply was merely cut off - then the text did hold cargo, and a second paid
      // reading would be cut off the same way.
      return read.lines.length > 0 || replyCut ? read : viaVision(fileBase64, "application/pdf");
    }
    case "xlsx":
      return readCargoText(await workbookText(buffer));
    case "text":
      return readCargoText(cargoTextOfFile(buffer));
    default:
      throw APIError.invalidArgument(UNREADABLE_CARGO_FILE);
  }
}
