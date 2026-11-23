import type Anthropic from "@anthropic-ai/sdk";
import { APIError } from "encore.dev/api";
import { askAi, MODEL, replyText } from "../lib/anthropic";
import { CARGO_LIST_PROMPT, MAX_CARGO_TEXT, cargoFileKind, cargoLinesOfReply, workbookText, type CargoLineRead } from "../lib/cargoList";
import { parseJsonObjectFromResponse } from "../lib/fields";
import { detectMediaType, extractTextFromPdf } from "../lib/pdf";

// A reply of 200 lines of about 40 tokens each.
const MAX_TOKENS = 8000;

export interface CargoListRead {
  lines: CargoLineRead[];
  /** The document was longer than one reading takes, or the reply was cut off: lines may be missing. */
  partial: boolean;
}

async function ask(content: Anthropic.MessageParam["content"], partial: boolean): Promise<CargoListRead> {
  const response = await askAi({ model: MODEL, max_tokens: MAX_TOKENS, system: CARGO_LIST_PROMPT, messages: [{ role: "user", content }] }, "cargo list reading");
  const reply = parseJsonObjectFromResponse(replyText(response));
  return { lines: cargoLinesOfReply(reply), partial: partial || response.stop_reason === "max_tokens" || !reply };
}

/** A cargo list given as text: pasted, or the text of a file. */
export function readCargoText(text: string): Promise<CargoListRead> {
  const sent = text.slice(0, MAX_CARGO_TEXT);
  return ask(`Extract the cargo lines from this document.\n\n---\n${sent}\n---`, text.length > MAX_CARGO_TEXT);
}

const viaVision = (fileBase64: string, mediaType: string): Promise<CargoListRead> => {
  const media: Anthropic.ContentBlockParam =
    mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } }
      : { type: "image", source: { type: "base64", media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: fileBase64 } };
  return ask([media, { type: "text", text: "Extract the cargo lines from this document." }], false);
};

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
      const read = await readCargoText(text);
      return read.lines.length > 0 ? read : viaVision(fileBase64, "application/pdf");
    }
    case "xlsx": {
      let text: string;
      try {
        text = await workbookText(buffer);
      } catch {
        throw APIError.invalidArgument("The Excel file could not be opened. Save it as .xlsx and try again.");
      }
      return readCargoText(text);
    }
    case "text":
      return readCargoText(buffer.toString("utf8"));
    default:
      throw APIError.invalidArgument("This kind of file cannot be read. Use a PDF, a picture (PNG, JPG), an .xlsx workbook, or a .csv or .txt file.");
  }
}
