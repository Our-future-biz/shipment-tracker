import type Anthropic from "@anthropic-ai/sdk";
import { APIError } from "encore.dev/api";
import { getClient, MODEL } from "../lib/anthropic";
import { extractTextFromPdf, isImageType, isPdfType, detectMediaType } from "../lib/pdf";
import { textReadingUsable } from "../lib/fields";
import { filterExtracted, parseJsonFromResponse, parseJsonObjectFromResponse, SHIPMENT_FIELDS, BOOKING_FIELDS, INVOICE_FIELDS, QUOTE_FIELDS, CUSTOMS_FIELDS } from "../lib/fields";
import { SHIPMENT_PROMPT, BOOKING_PROMPT, INVOICE_PROMPT, QUOTE_PROMPT, CUSTOMS_PROMPT } from "../lib/prompts";
import { normalizeQuoteFields } from "../lib/quoteFields";
import type { ExtractionResult } from "../interfaces/interfaces";
import { canonicalizeRecords, resolveGeo } from "./places.service";

// The model only returns useful keys when told the exact field names to use;
// filterExtracted() then keeps only exact matches, so the list must be injected.
function withFieldList(systemPrompt: string, validFields: string[]): string {
  return `${systemPrompt}\n\nFields to extract (use these EXACT key names as JSON keys):\n${validFields
    .map((f) => `- "${f}"`)
    .join("\n")}`;
}

// Build the media content block for a file: PDFs must use a "document" block,
// images use an "image" block (Anthropic rejects application/pdf as an image).
function mediaBlock(fileBase64: string, mediaType: string): Anthropic.ContentBlockParam {
  if (mediaType === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: fileBase64 },
    };
  }
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      data: fileBase64,
    },
  };
}

async function extractViaVision(
  fileBase64: string,
  mediaType: string,
  systemPrompt: string,
  validFields: string[],
  userPrompt: string,
): Promise<Record<string, string>> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: withFieldList(systemPrompt, validFields),
    messages: [{
      role: "user",
      content: [mediaBlock(fileBase64, mediaType), { type: "text", text: userPrompt }],
    }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = parseJsonObjectFromResponse(text);
  if (!parsed) return {};
  return filterExtracted(parsed, validFields);
}

async function extractViaText(
  documentText: string,
  systemPrompt: string,
  validFields: string[],
  userPrompt: string,
  maxTokens = 2048,
): Promise<Record<string, string>> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: withFieldList(systemPrompt, validFields),
    messages: [{
      role: "user",
      content: `${userPrompt}\n\n---\n${documentText.substring(0, 15000)}\n---\n\nReturn ONLY a JSON object with the extracted fields.`,
    }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = parseJsonObjectFromResponse(text);
  if (!parsed) return {};
  return filterExtracted(parsed, validFields);
}

export async function extractFromDocument(
  fileBase64: string,
  fileName: string,
  mediaType: string,
  systemPrompt: string,
  validFields: string[],
  userPrompt: string,
  maxTokens = 2048,
  /** Fields a reading of the PDF's text layer must find to be kept; without them the page is read as an image. */
  requiredFields: string[] = [],
): Promise<ExtractionResult> {
  // Image files → go straight to vision
  if (isImageType(mediaType)) {
    const extracted = await extractViaVision(fileBase64, mediaType, systemPrompt, validFields, userPrompt);
    return { extracted, fieldCount: Object.keys(extracted).length, method: "vision", fileName };
  }

  // PDF → try text extraction first
  if (isPdfType(mediaType)) {
    const buffer = Buffer.from(fileBase64, "base64");
    const pdfText = await extractTextFromPdf(buffer);

    if (pdfText.length >= 20) {
      const extracted = await extractViaText(pdfText, systemPrompt, validFields, userPrompt, maxTokens);
      // A scan may carry only a stamp as text (a recipient's "REF NO."): the document itself is the image.
      if (textReadingUsable(extracted, requiredFields)) {
        return { extracted, fieldCount: Object.keys(extracted).length, method: "text", fileName };
      }
    }

    // Fallback: send PDF as image to vision (Claude can read PDFs directly)
    const extracted = await extractViaVision(fileBase64, mediaType, systemPrompt, validFields, userPrompt);
    return { extracted, fieldCount: Object.keys(extracted).length, method: "vision", fileName };
  }

  return { extracted: {}, fieldCount: 0, method: "text", fileName };
}

// ─── Public API (called by controllers) ──────────────────────────

// Places and countries come back in the database's form (see places.service).
async function withCanonicalPlaces(result: Promise<ExtractionResult>): Promise<ExtractionResult> {
  const done = await result;
  await canonicalizeRecords([done.extracted]);
  return done;
}

// What the places of a quote mean, as the quote page's own inquiry import asks for them: a quote's
// origin and destination become the shipment's POL and POD.
const QUOTE_PLACE_ROLES: Record<string, string> = {
  Origin: "origin: port or place the cargo leaves from",
  Destination: "destination: port or place the cargo goes to",
};

// A customer's request comes back in the forms a Sales quote stores (lib/quoteFields), its places
// in the database's form. What matches no place stays as read; the screens flag it.
async function asQuoteFields(done: ExtractionResult): Promise<ExtractionResult> {
  const extracted = normalizeQuoteFields(done.extracted);
  const labels = Object.keys(QUOTE_PLACE_ROLES).filter((label) => extracted[label]);
  const places = await resolveGeo(labels.map((label) => ({ text: extracted[label]!, kind: "place" as const, role: QUOTE_PLACE_ROLES[label] })));
  labels.forEach((label, i) => {
    if (places[i]) extracted[label] = places[i]!;
  });
  return { ...done, extracted, fieldCount: Object.keys(extracted).length };
}

export async function extractShipmentFromFile(fileBase64: string, fileName: string): Promise<ExtractionResult> {
  const mediaType = detectMediaType(fileName);
  return withCanonicalPlaces(
    extractFromDocument(fileBase64, fileName, mediaType, SHIPMENT_PROMPT, SHIPMENT_FIELDS, "Extract all shipping data from this document."),
  );
}

export async function extractInvoiceFromFile(fileBase64: string, fileName: string): Promise<ExtractionResult> {
  const mediaType = detectMediaType(fileName);
  return extractFromDocument(fileBase64, fileName, mediaType, INVOICE_PROMPT, INVOICE_FIELDS, "Extract invoice/cost data from this document.", 1024, [
    "total_amount",
  ]);
}

export async function extractQuoteFromFile(fileBase64: string, fileName: string): Promise<ExtractionResult> {
  const mediaType = detectMediaType(fileName);
  // A type the reader cannot open is refused by name, not answered as a document with nothing in it.
  if (!isImageType(mediaType) && !isPdfType(mediaType)) {
    throw APIError.invalidArgument("This file type cannot be read - only PDF, JPG and PNG files can. Save the email as PDF or paste its text.");
  }
  return asQuoteFields(
    await extractFromDocument(fileBase64, fileName, mediaType, QUOTE_PROMPT, QUOTE_FIELDS, "Extract the customer's request from this document."),
  );
}

export async function extractBookingFromFile(fileBase64: string, fileName: string): Promise<ExtractionResult> {
  const mediaType = detectMediaType(fileName);
  return withCanonicalPlaces(
    extractFromDocument(fileBase64, fileName, mediaType, BOOKING_PROMPT, BOOKING_FIELDS, "Extract the booking details from this booking confirmation."),
  );
}

export async function extractCustomsFromFile(fileBase64: string, fileName: string): Promise<ExtractionResult> {
  const mediaType = detectMediaType(fileName);
  return extractFromDocument(fileBase64, fileName, mediaType, CUSTOMS_PROMPT, CUSTOMS_FIELDS, "Extract the MRN number and shipment data from this customs document.", 512);
}

// A customer's e-mail, with its signature and the mail it answers, is longer than a line of shipping data.
const MAX_TEXT = 1500;
export const MAX_QUOTE_TEXT = 6000;

export async function extractFromTextByDestination(text: string, destination: string): Promise<ExtractionResult> {
  const maxLength = destination === "quote" ? MAX_QUOTE_TEXT : MAX_TEXT;
  if (text.length > maxLength) throw APIError.invalidArgument(`text must be at most ${maxLength} characters`);
  let systemPrompt: string;
  let fields: string[];
  let userPrompt: string;

  switch (destination) {
    case "invoicing":
      systemPrompt = INVOICE_PROMPT;
      fields = INVOICE_FIELDS;
      userPrompt = "Extract invoice/cost data from this text:";
      break;
    case "customs":
      systemPrompt = CUSTOMS_PROMPT;
      fields = CUSTOMS_FIELDS;
      userPrompt = "Extract the MRN number and shipment data from this text:";
      break;
    case "booking":
      systemPrompt = BOOKING_PROMPT;
      fields = BOOKING_FIELDS;
      userPrompt = "Extract the booking details from this booking confirmation:";
      break;
    case "quote":
      systemPrompt = QUOTE_PROMPT;
      fields = QUOTE_FIELDS;
      userPrompt = "Extract the customer's request from this text:";
      break;
    default:
      systemPrompt = SHIPMENT_PROMPT;
      fields = SHIPMENT_FIELDS;
      userPrompt = "Extract shipping data from this text:";
      break;
  }

  const extracted = await extractViaText(text, systemPrompt, fields, userPrompt);
  if (destination === "quote") return asQuoteFields({ extracted, fieldCount: 0, method: "text", fileName: "(text input)" });
  if (destination !== "invoicing") await canonicalizeRecords([extracted]);
  return { extracted, fieldCount: Object.keys(extracted).length, method: "text", fileName: "(text input)" };
}

// For pipeline: classify pages (each page is its own PDF/image document block)
export async function classifyPages(
  pages: Array<{ pageNum: number; base64: string; mediaType: string }>,
): Promise<Array<{ page: number; type: string; ref?: string }>> {
  const client = getClient();
  const pageBlocks: Anthropic.ContentBlockParam[] = pages.map((p) => mediaBlock(p.base64, p.mediaType));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: [
        ...pageBlocks,
        {
          type: "text",
          text: `These are ${pages.length} pages from a shipping document, in order. Classify EACH page.\n\nTypes:\n- MANIFEST: Cargo manifest/list showing multiple shipments in blocks\n- HBL: House Bill of Lading for one shipment — including its continuation/rider pages and a rated or unrated copy\n- MBL: Master Bill of Lading (single consolidated B/L with many cargo items)\n- INVOICE: Commercial invoice, pro-forma invoice\n- PACKING_LIST: Packing list, packing specification\n- SKIP: Terms & conditions, blank pages, fax/e-mail cover sheets, signatures, anything without shipment data\n\nFor every HBL page also give "ref": the House B/L number printed on it (e.g. "CHI/BRV/V01035"), exactly as printed, or "" if none is visible. A continuation page of the same HBL carries the same ref.\n\nReturn ONLY a JSON array with one object per page, in order: [{"page": 1, "type": "HBL", "ref": "CHI/BRV/V01035"}, ...]\nNo markdown.`,
        },
      ],
    }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = parseJsonFromResponse(text);
  if (!Array.isArray(parsed)) return pages.map((p) => ({ page: p.pageNum, type: "HBL" }));
  return parsed as Array<{ page: number; type: string; ref?: string }>;
}

// For pipeline: extract from multiple pages (HBL batch, MBL) sent as document blocks
export async function extractFromPages(
  pages: Array<{ base64: string; mediaType: string }>,
  systemPrompt: string,
  userPrompt: string,
  validFields: string[],
  maxTokens = 8192,
): Promise<Record<string, string>[]> {
  const client = getClient();
  const pageBlocks: Anthropic.ContentBlockParam[] = pages.map((p) => mediaBlock(p.base64, p.mediaType));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: withFieldList(systemPrompt, validFields),
    messages: [{
      role: "user",
      content: [
        ...pageBlocks,
        { type: "text", text: userPrompt },
      ],
    }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = parseJsonFromResponse(text);
  if (!parsed) return [];

  const arr = Array.isArray(parsed) ? parsed : [parsed];
  return arr.map((item) => filterExtracted(item as Record<string, unknown>, validFields));
}
