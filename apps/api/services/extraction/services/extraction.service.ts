import Anthropic from "@anthropic-ai/sdk";
import { secret } from "encore.dev/config";
import { extractTextFromPdf, isImageType, isPdfType, detectMediaType } from "../lib/pdf";
import { filterExtracted, parseJsonFromResponse, SHIPMENT_FIELDS, INVOICE_FIELDS, QUOTE_FIELDS } from "../lib/fields";
import { SHIPMENT_PROMPT, INVOICE_PROMPT, QUOTE_PROMPT } from "../lib/prompts";
import type { ExtractionResult } from "../interfaces/interfaces";

const anthropicApiKey = secret("ANTHROPIC_API_KEY");
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

function getClient(): Anthropic {
  // Prefer the Encore secret; fall back to the OS env var for local runs where
  // the cloud secret store isn't reachable.
  const apiKey = anthropicApiKey() || process.env.ANTHROPIC_API_KEY;
  return new Anthropic({ apiKey });
}

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

  const parsed = parseJsonFromResponse(text);
  if (!parsed || typeof parsed !== "object") return {};
  return filterExtracted(parsed as Record<string, unknown>, validFields);
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

  const parsed = parseJsonFromResponse(text);
  if (!parsed || typeof parsed !== "object") return {};
  return filterExtracted(parsed as Record<string, unknown>, validFields);
}

export async function extractFromDocument(
  fileBase64: string,
  fileName: string,
  mediaType: string,
  systemPrompt: string,
  validFields: string[],
  userPrompt: string,
  maxTokens = 2048,
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
      if (Object.keys(extracted).length > 0) {
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

export async function extractShipmentFromFile(fileBase64: string, fileName: string): Promise<ExtractionResult> {
  const mediaType = detectMediaType(fileName);
  return extractFromDocument(fileBase64, fileName, mediaType, SHIPMENT_PROMPT, SHIPMENT_FIELDS, "Extract all shipping data from this document.");
}

export async function extractInvoiceFromFile(fileBase64: string, fileName: string): Promise<ExtractionResult> {
  const mediaType = detectMediaType(fileName);
  return extractFromDocument(fileBase64, fileName, mediaType, INVOICE_PROMPT, INVOICE_FIELDS, "Extract invoice/cost data from this document.", 1024);
}

export async function extractQuoteFromFile(fileBase64: string, fileName: string): Promise<ExtractionResult> {
  const mediaType = detectMediaType(fileName);
  return extractFromDocument(fileBase64, fileName, mediaType, QUOTE_PROMPT, QUOTE_FIELDS, "Extract shipping/quote data from this document.");
}

export async function extractFromTextByDestination(text: string, destination: string): Promise<ExtractionResult> {
  let systemPrompt: string;
  let fields: string[];
  let userPrompt: string;

  switch (destination) {
    case "invoicing":
      systemPrompt = INVOICE_PROMPT;
      fields = INVOICE_FIELDS;
      userPrompt = "Extract invoice/cost data from this text:";
      break;
    case "quote":
      systemPrompt = QUOTE_PROMPT;
      fields = QUOTE_FIELDS;
      userPrompt = "Extract shipping/quote data from this text:";
      break;
    default:
      systemPrompt = SHIPMENT_PROMPT;
      fields = SHIPMENT_FIELDS;
      userPrompt = "Extract shipping data from this text:";
      break;
  }

  const extracted = await extractViaText(text, systemPrompt, fields, userPrompt);
  return { extracted, fieldCount: Object.keys(extracted).length, method: "text", fileName: "(text input)" };
}

// For pipeline: classify pages (each page is its own PDF/image document block)
export async function classifyPages(
  pages: Array<{ pageNum: number; base64: string; mediaType: string }>,
): Promise<Array<{ page: number; type: string }>> {
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
          text: `These are ${pages.length} pages from a shipping document, in order. Classify EACH page.\n\nTypes:\n- MANIFEST: Cargo manifest/list showing multiple shipments in blocks\n- HBL: House Bill of Lading (full-page B/L for one shipment)\n- MBL: Master Bill of Lading (single consolidated B/L with many cargo items)\n- SKIP: Terms & conditions, blank pages, signatures, cover pages, anything without shipment data\n\nReturn ONLY a JSON array with one object per page, in order: [{"page": 1, "type": "HBL"}, ...]\nNo markdown.`,
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
  return parsed as Array<{ page: number; type: string }>;
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
