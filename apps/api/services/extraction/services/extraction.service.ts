import Anthropic from "@anthropic-ai/sdk";
import { extractTextFromPdf, isImageType, isPdfType, detectMediaType } from "../lib/pdf";
import { filterExtracted, parseJsonFromResponse, SHIPMENT_FIELDS, INVOICE_FIELDS, QUOTE_FIELDS } from "../lib/fields";
import { SHIPMENT_PROMPT, INVOICE_PROMPT, QUOTE_PROMPT } from "../lib/prompts";
import type { ExtractionResult } from "../interfaces/interfaces";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20241022";

function getClient(): Anthropic {
  return new Anthropic();
}

async function extractViaVision(
  imageBase64: string,
  mediaType: string,
  systemPrompt: string,
  validFields: string[],
  userPrompt: string,
): Promise<Record<string, string>> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: imageBase64,
          },
        },
        { type: "text", text: userPrompt },
      ],
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
    system: systemPrompt,
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

// For pipeline: classify pages using vision
export async function classifyPages(
  pages: Array<{ pageNum: number; base64: string }>,
): Promise<Array<{ page: number; type: string }>> {
  const client = getClient();
  const imageBlocks: Anthropic.ImageBlockParam[] = pages.map((p) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: "image/png" as const,
      data: p.base64,
    },
  }));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: [
        ...imageBlocks,
        {
          type: "text",
          text: `These are ${pages.length} pages from a shipping document PDF. Classify each page.\n\nTypes:\n- MANIFEST: Cargo manifest with multiple shipments\n- HBL: House Bill of Lading (one shipment per page)\n- MBL: Master Bill of Lading (consolidated)\n- SKIP: Terms, blank pages, signatures\n\nReturn a JSON array: [{"page": 1, "type": "HBL"}, ...]\nNo markdown.`,
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

// For pipeline: extract from multiple images (HBL batch, MBL)
export async function extractFromImages(
  images: Array<{ base64: string }>,
  systemPrompt: string,
  userPrompt: string,
  validFields: string[],
  maxTokens = 8192,
): Promise<Record<string, string>[]> {
  const client = getClient();
  const imageBlocks: Anthropic.ImageBlockParam[] = images.map((img) => ({
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: "image/png" as const,
      data: img.base64,
    },
  }));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{
      role: "user",
      content: [
        ...imageBlocks,
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
