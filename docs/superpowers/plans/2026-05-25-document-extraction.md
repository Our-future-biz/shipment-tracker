# Document Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-powered document extraction to the shipment tracker — upload PDFs/images of shipping documents, invoices, quotes, and multi-page BL packages, and extract structured data using Claude.

**Architecture:** New `extraction` Encore service with no database. Uses `@anthropic-ai/sdk` (already installed) for Claude API calls, `pdf-parse` for PDF text extraction, and Claude Vision for image/scanned PDF processing. Files are sent as base64-encoded strings in JSON request bodies to avoid multipart complexity. Pipeline sessions stored in-memory Map with 30-minute expiry.

**Tech Stack:** Encore.dev, @anthropic-ai/sdk, pdf-parse, TypeScript, React, Ant Design

---

### Task 1: Create Extraction Service Scaffold

**Files:**
- Create: `apps/api/services/extraction/encore.service.ts`
- Create: `apps/api/services/extraction/lib/fields.ts`
- Create: `apps/api/services/extraction/lib/prompts.ts`

- [ ] **Step 1: Create service declaration**

Create `apps/api/services/extraction/encore.service.ts`:

```typescript
import { Service } from "encore.dev/service";

export default new Service("extraction");
```

- [ ] **Step 2: Create extractable field lists**

Create `apps/api/services/extraction/lib/fields.ts`:

```typescript
export const SHIPMENT_FIELDS = [
  "Shipper", "Consignee", "Personal Reference", "Container Number",
  "Booking Number", "Load Type", "Shipping line / Coloader",
  "POL", "POD", "Destination", "HS Code", "Cargo Description",
  "House BoL Number", "Master BoL Number", "House BoL Type", "Master BoL Type",
  "Vessel", "Voyage",
  "CNTR count [1]", "CNTR length [1]", "CNTR type [1]",
  "CNTR count [2]", "CNTR length [2]", "CNTR type [2]",
  "CNTR count [3]", "CNTR length [3]", "CNTR type [3]",
  "CNTR count [4]", "CNTR length [4]", "CNTR type [4]",
  "PCS", "Total Weight In Tons", "Total Volume In CBM",
  "Cargo Origin", "Country code", "Origin",
  "Estimated Departure", "Estimated Arrival",
  "Trade Direction", "Agent",
  "Incoterm Origin", "Incoterm Destination",
  "Commercial Invoice Value",
];

export const QUOTE_FIELDS = [
  "Shipper", "Consignee", "Load Type", "Agent", "Agent's PIC",
  "Incoterm Origin", "Incoterm Destination", "Cargo Origin", "Origin",
  "POL", "POD", "Destination", "HS Code", "Cargo Description",
  "Trade Direction", "Volume", "Weight", "Number of pieces",
  "CNTR count [1]", "CNTR length [1]",
  "CNTR count [2]", "CNTR length [2]",
  "CNTR count [3]", "CNTR length [3]",
  "CNTR count [4]", "CNTR length [4]",
  "PCS",
];

export const INVOICE_FIELDS = [
  "total_amount", "currency", "vendor", "invoice_number",
  "invoice_date", "due_date", "description", "service_type",
];

export function filterExtracted(
  raw: Record<string, unknown>,
  validFields: string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  const fieldSet = new Set(validFields);
  for (const [key, value] of Object.entries(raw)) {
    if (!fieldSet.has(key) && key !== "__type__" && key !== "Personal Reference") continue;
    if (typeof value === "string" && value.trim()) {
      result[key] = value.trim();
    }
  }
  return result;
}

export function parseJsonFromResponse(text: string): unknown {
  // Try array first
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch { /* fall through */ }
  }
  // Try object
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { /* fall through */ }
  }
  return null;
}
```

- [ ] **Step 3: Create system prompts**

Create `apps/api/services/extraction/lib/prompts.ts`:

```typescript
export const SHIPMENT_PROMPT = `You are a shipping document data extractor. You extract structured data from:
- Bills of Lading (B/L), Sea Waybills (SWB)
- Booking Confirmations
- Cargo Manifests, Packing Lists
- Commercial Invoices

Rules:
- Date format: MM/DD/YY (e.g., 03/15/25)
- Load Type: return exactly "FCL" or "LCL"
- House/Master BoL Type: "OBL", "SWB", "TLX" (Telex release), or "Express"
- Trade Direction: "IMP" (import) or "EXP" (export)
- CNTR length: "20", "40", "40HC", "45"
- CNTR type: "DRY", "REEFER", "OT" (Open Top), "FR" (Flat Rack), "TANK"
- CNTR count: return as number string (e.g., "2")
- Container Number: actual container ID (e.g., "MSMU1234567"), not a count
- Return ONLY a JSON object. No markdown, no explanation, no code fences.`;

export const INVOICE_PROMPT = `You are an invoice data extractor. You extract cost/billing data from:
- Commercial Invoices, Debit Notes, Credit Notes
- Proforma Invoices, Freight Bills
- Customs Declarations

Rules:
- total_amount: final/grand total as number string, NO currency symbol (e.g., "1234.56")
- currency: ISO 4217 code (CZK, USD, EUR, GBP, CHF, CNY, JPY, etc.)
- vendor: the entity ISSUING the invoice (not the consignee/recipient)
- invoice_number: the document reference number
- invoice_date: DD/MM/YYYY format
- due_date: DD/MM/YYYY format
- description: brief summary, max 80 characters
- service_type: one of "freight", "collection", "locals", "others", "insurance", "customs"
- Return ONLY a JSON object. No markdown, no explanation, no code fences.`;

export const QUOTE_PROMPT = `You are a shipping quote/rate request data extractor. You extract structured data from:
- Rate Requests, Booking Inquiries, Quotation Requests
- Bills of Lading, Sea Waybills, Booking Confirmations
- Cargo Manifests, Packing Lists, Commercial Invoices

Rules:
- Load Type: return exactly "FCL" or "LCL"
- Trade Direction: "IMP" (import) or "EXP" (export)
- CNTR length: "20", "40", "40HC", "45"
- CNTR count: return as number string
- Volume in CBM, Weight in KGS
- Return ONLY a JSON object. No markdown, no explanation, no code fences.`;

export const MASTER_JOB_PROMPT = `You are a shipping document data extractor for multi-page documents. Pages can be:

TYPE 1 - MANIFEST/CARGO LIST: Multiple shipments in blocks. Each block has S: (Shipper), C: (Consignee), N: (Notify), and a unique reference. Each block = 1 shipment.

TYPE 2 - HOUSE BILL OF LADING (HBL): Full-page document for ONE shipment. Each page = 1 shipment.

TYPE 3 - MASTER BILL OF LADING (MBL): A single consolidated document with many cargo items marked N/M, often with "TO BE CONTINUED". This is NOT individual shipments. Extract ONLY shared shipping info and add "__type__": "MBL".

Rules:
- Return a JSON ARRAY of objects. Each object = one shipment OR one MBL info block.
- Date format: MM/DD/YY
- Load Type: "FCL" or "LCL"
- H/BL & M/BL type: "OBL", "SWB", "TLX", "Express"
- Trade Direction: "IMP" or "EXP"
- CNTR length: "20", "40", "40HC", "45"
- CNTR type: "DRY", "REEFER", "OT", "FR", "TANK"
- CNTR count: number as string
- For MBL pages: return 1 object with shared info + "__type__": "MBL"
- Return ONLY a JSON array. No markdown, no explanation, no code fences.`;

export const CLASSIFICATION_PROMPT = `Classify each page image. For each page, return its type:
- MANIFEST: Cargo manifest/list with multiple shipments in blocks (S: Shipper, C: Consignee)
- HBL: House Bill of Lading (full-page for ONE shipment)
- MBL: Master Bill of Lading (consolidated with many cargo items, N/M marks, "TO BE CONTINUED")
- SKIP: Terms & conditions, blank pages, signatures, cover pages

Return a JSON array: [{"page": 1, "type": "HBL"}, {"page": 2, "type": "MANIFEST"}, ...]
No markdown, no explanation, no code fences.`;
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/services/extraction/
git commit -m "feat: scaffold extraction service with field lists and prompts"
```

---

### Task 2: PDF Processing and Claude API Helpers

**Files:**
- Create: `apps/api/services/extraction/lib/pdf.ts`
- Create: `apps/api/services/extraction/services/extraction.service.ts`

- [ ] **Step 1: Install pdf-parse**

```bash
cd apps/api && pnpm add pdf-parse && pnpm add -D @types/pdf-parse
```

Note: `@anthropic-ai/sdk` is already installed.

- [ ] **Step 2: Create PDF processing helper**

Create `apps/api/services/extraction/lib/pdf.ts`:

```typescript
import pdfParse from "pdf-parse";

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const result = await pdfParse(buffer);
    return result.text || "";
  } catch {
    return "";
  }
}

export function detectMediaType(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop() || "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

export function isImageType(mediaType: string): boolean {
  return mediaType.startsWith("image/");
}

export function isPdfType(mediaType: string): boolean {
  return mediaType === "application/pdf";
}
```

- [ ] **Step 3: Create extraction service**

Create `apps/api/services/extraction/services/extraction.service.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { extractTextFromPdf, isImageType, isPdfType } from "../lib/pdf";
import { filterExtracted, parseJsonFromResponse } from "../lib/fields";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20241022";

function getClient(): Anthropic {
  return new Anthropic();
}

export interface ExtractionResult {
  extracted: Record<string, string>;
  fieldCount: number;
  method: "text" | "vision";
  fileName: string;
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

export async function extractFromText(
  text: string,
  systemPrompt: string,
  validFields: string[],
  userPrompt: string,
): Promise<ExtractionResult> {
  const extracted = await extractViaText(text, systemPrompt, validFields, userPrompt);
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
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/services/extraction/
git commit -m "feat: add PDF processing and Claude extraction service"
```

---

### Task 3: Pipeline Session Management

**Files:**
- Create: `apps/api/services/extraction/services/pipeline.service.ts`

- [ ] **Step 1: Create pipeline service**

Create `apps/api/services/extraction/services/pipeline.service.ts`:

```typescript
interface PipelinePage {
  pageNum: number;
  type: string;
  base64: string;
}

interface PipelineSession {
  pages: PipelinePage[];
  mblInfo: Record<string, string> | null;
  shipments: Record<string, string>[];
  fileName: string;
  createdAt: number;
}

const sessions = new Map<string, PipelineSession>();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

function cleanup() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

export function createSession(pages: PipelinePage[], fileName: string): string {
  cleanup();
  const sessionId = `pipe-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  sessions.set(sessionId, {
    pages,
    mblInfo: null,
    shipments: [],
    fileName,
    createdAt: Date.now(),
  });
  return sessionId;
}

export function getSession(sessionId: string): PipelineSession | null {
  cleanup();
  return sessions.get(sessionId) || null;
}

export function updateSession(sessionId: string, updates: Partial<PipelineSession>): void {
  const session = sessions.get(sessionId);
  if (session) {
    Object.assign(session, updates);
  }
}

export function getPagesByType(sessionId: string, type: string): PipelinePage[] {
  const session = getSession(sessionId);
  if (!session) return [];
  return session.pages.filter((p) => p.type === type);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/services/extraction/services/pipeline.service.ts
git commit -m "feat: add pipeline session management"
```

---

### Task 4: Single Document Extraction Endpoints

**Files:**
- Create: `apps/api/services/extraction/controllers/extractDocument.controller.ts`
- Create: `apps/api/services/extraction/controllers/extractInvoice.controller.ts`
- Create: `apps/api/services/extraction/controllers/extractQuote.controller.ts`
- Create: `apps/api/services/extraction/controllers/extractText.controller.ts`

- [ ] **Step 1: Create extract document endpoint**

Create `apps/api/services/extraction/controllers/extractDocument.controller.ts`:

```typescript
import { api, APIError } from "encore.dev/api";
import { extractFromDocument } from "../services/extraction.service";
import { SHIPMENT_FIELDS } from "../lib/fields";
import { SHIPMENT_PROMPT } from "../lib/prompts";
import { detectMediaType } from "../lib/pdf";

interface ExtractDocumentRequest {
  fileBase64: string;
  fileName: string;
}

interface ExtractDocumentResponse {
  extracted: Record<string, string>;
  fieldCount: number;
  method: string;
  fileName: string;
}

export const extractDocument = api(
  { expose: true, auth: false, method: "POST", path: "/extraction/document" },
  async (req: ExtractDocumentRequest): Promise<ExtractDocumentResponse> => {
    if (!req.fileBase64 || !req.fileName) {
      throw APIError.invalidArgument("fileBase64 and fileName are required");
    }
    const mediaType = detectMediaType(req.fileName);
    const result = await extractFromDocument(
      req.fileBase64,
      req.fileName,
      mediaType,
      SHIPMENT_PROMPT,
      SHIPMENT_FIELDS,
      "Extract all shipping data from this document.",
    );
    return result;
  },
);
```

- [ ] **Step 2: Create extract invoice endpoint**

Create `apps/api/services/extraction/controllers/extractInvoice.controller.ts`:

```typescript
import { api, APIError } from "encore.dev/api";
import { extractFromDocument } from "../services/extraction.service";
import { INVOICE_FIELDS } from "../lib/fields";
import { INVOICE_PROMPT } from "../lib/prompts";
import { detectMediaType } from "../lib/pdf";

interface ExtractInvoiceRequest {
  fileBase64: string;
  fileName: string;
}

interface ExtractInvoiceResponse {
  extracted: Record<string, string>;
  fieldCount: number;
  method: string;
  fileName: string;
}

export const extractInvoice = api(
  { expose: true, auth: false, method: "POST", path: "/extraction/invoice" },
  async (req: ExtractInvoiceRequest): Promise<ExtractInvoiceResponse> => {
    if (!req.fileBase64 || !req.fileName) {
      throw APIError.invalidArgument("fileBase64 and fileName are required");
    }
    const mediaType = detectMediaType(req.fileName);
    const result = await extractFromDocument(
      req.fileBase64,
      req.fileName,
      mediaType,
      INVOICE_PROMPT,
      INVOICE_FIELDS,
      "Extract invoice/cost data from this document.",
      1024,
    );
    return result;
  },
);
```

- [ ] **Step 3: Create extract quote endpoint**

Create `apps/api/services/extraction/controllers/extractQuote.controller.ts`:

```typescript
import { api, APIError } from "encore.dev/api";
import { extractFromDocument } from "../services/extraction.service";
import { QUOTE_FIELDS } from "../lib/fields";
import { QUOTE_PROMPT } from "../lib/prompts";
import { detectMediaType } from "../lib/pdf";

interface ExtractQuoteRequest {
  fileBase64: string;
  fileName: string;
}

interface ExtractQuoteResponse {
  extracted: Record<string, string>;
  fieldCount: number;
  method: string;
  fileName: string;
}

export const extractQuote = api(
  { expose: true, auth: false, method: "POST", path: "/extraction/quote" },
  async (req: ExtractQuoteRequest): Promise<ExtractQuoteResponse> => {
    if (!req.fileBase64 || !req.fileName) {
      throw APIError.invalidArgument("fileBase64 and fileName are required");
    }
    const mediaType = detectMediaType(req.fileName);
    const result = await extractFromDocument(
      req.fileBase64,
      req.fileName,
      mediaType,
      QUOTE_PROMPT,
      QUOTE_FIELDS,
      "Extract shipping/quote data from this document.",
    );
    return result;
  },
);
```

- [ ] **Step 4: Create extract text endpoint**

Create `apps/api/services/extraction/controllers/extractText.controller.ts`:

```typescript
import { api, APIError } from "encore.dev/api";
import { extractFromText } from "../services/extraction.service";
import { SHIPMENT_FIELDS, INVOICE_FIELDS, QUOTE_FIELDS } from "../lib/fields";
import { SHIPMENT_PROMPT, INVOICE_PROMPT, QUOTE_PROMPT } from "../lib/prompts";

interface ExtractTextRequest {
  text: string;
  destination: string; // "shipment" | "invoicing" | "quote"
}

interface ExtractTextResponse {
  extracted: Record<string, string>;
  fieldCount: number;
  method: string;
  fileName: string;
}

export const extractText = api(
  { expose: true, auth: false, method: "POST", path: "/extraction/text" },
  async (req: ExtractTextRequest): Promise<ExtractTextResponse> => {
    if (!req.text || req.text.length < 10) {
      throw APIError.invalidArgument("text must be at least 10 characters");
    }
    if (req.text.length > 1500) {
      throw APIError.invalidArgument("text must be at most 1500 characters");
    }

    let systemPrompt: string;
    let fields: string[];
    let userPrompt: string;

    switch (req.destination) {
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

    const result = await extractFromText(req.text, systemPrompt, fields, userPrompt);
    return result;
  },
);
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/services/extraction/controllers/
git commit -m "feat: add single document extraction endpoints"
```

---

### Task 5: Pipeline Endpoints (Master Job)

**Files:**
- Create: `apps/api/services/extraction/controllers/pipelinePrepare.controller.ts`
- Create: `apps/api/services/extraction/controllers/pipelineExtractMbl.controller.ts`
- Create: `apps/api/services/extraction/controllers/pipelineExtractHbl.controller.ts`

- [ ] **Step 1: Create pipeline prepare endpoint**

Create `apps/api/services/extraction/controllers/pipelinePrepare.controller.ts`:

```typescript
import { api, APIError } from "encore.dev/api";
import { classifyPages } from "../services/extraction.service";
import { createSession } from "../services/pipeline.service";
import { extractTextFromPdf } from "../lib/pdf";

interface PipelinePrepareRequest {
  fileBase64: string;
  fileName: string;
}

interface PageInfo {
  pageNum: number;
  type: string;
}

interface PipelinePrepareResponse {
  sessionId: string;
  pageCount: number;
  classification: Record<string, number>;
  pages: PageInfo[];
  fileName: string;
}

export const pipelinePrepare = api(
  { expose: true, auth: false, method: "POST", path: "/extraction/pipeline/prepare" },
  async (req: PipelinePrepareRequest): Promise<PipelinePrepareResponse> => {
    if (!req.fileBase64 || !req.fileName) {
      throw APIError.invalidArgument("fileBase64 and fileName are required");
    }

    // For now, treat the entire document as a single page for classification
    // Claude can handle multi-page PDFs directly via the vision API
    const pages = [{ pageNum: 1, base64: req.fileBase64 }];

    // Classify pages
    const classified = await classifyPages(pages);

    // Build session pages with classification
    const sessionPages = pages.map((p, i) => ({
      pageNum: p.pageNum,
      type: classified[i]?.type || "HBL",
      base64: p.base64,
    }));

    const sessionId = createSession(sessionPages, req.fileName);

    // Count classifications
    const classification: Record<string, number> = { MANIFEST: 0, HBL: 0, MBL: 0, SKIP: 0 };
    for (const page of sessionPages) {
      classification[page.type] = (classification[page.type] || 0) + 1;
    }

    return {
      sessionId,
      pageCount: sessionPages.length,
      classification,
      pages: sessionPages.map((p) => ({ pageNum: p.pageNum, type: p.type })),
      fileName: req.fileName,
    };
  },
);
```

- [ ] **Step 2: Create MBL extraction endpoint**

Create `apps/api/services/extraction/controllers/pipelineExtractMbl.controller.ts`:

```typescript
import { api, APIError } from "encore.dev/api";
import { extractFromImages } from "../services/extraction.service";
import { getSession, getPagesByType, updateSession } from "../services/pipeline.service";
import { SHIPMENT_FIELDS } from "../lib/fields";

interface PipelineExtractMblRequest {
  sessionId: string;
}

interface PipelineExtractMblResponse {
  mblInfo: Record<string, string> | null;
  message?: string;
}

export const pipelineExtractMbl = api(
  { expose: true, auth: false, method: "POST", path: "/extraction/pipeline/extract-mbl" },
  async (req: PipelineExtractMblRequest): Promise<PipelineExtractMblResponse> => {
    const session = getSession(req.sessionId);
    if (!session) {
      throw APIError.notFound("Pipeline session not found or expired");
    }

    const mblPages = getPagesByType(req.sessionId, "MBL");
    if (mblPages.length === 0) {
      return { mblInfo: null, message: "No MBL pages found" };
    }

    const images = mblPages.slice(0, 3).map((p) => ({ base64: p.base64 }));
    const results = await extractFromImages(
      images,
      "",
      `This is a Master Bill of Lading (MBL). Extract ONLY the shared shipping info:\n- Vessel / Voyage\n- POL, POD\n- ETD date, ETA date\n- Shipping line / Coloader\n- Booking number\n- FCL/LCL\n- CNTR no. (all container numbers)\n- CNTR count, length, type\nDo NOT extract cargo items. Return a single JSON object.`,
      SHIPMENT_FIELDS,
      2048,
    );

    const mblInfo = results[0] || null;
    updateSession(req.sessionId, { mblInfo });

    return { mblInfo };
  },
);
```

- [ ] **Step 3: Create HBL batch extraction endpoint**

Create `apps/api/services/extraction/controllers/pipelineExtractHbl.controller.ts`:

```typescript
import { api, APIError } from "encore.dev/api";
import { extractFromImages } from "../services/extraction.service";
import { getSession, getPagesByType, updateSession } from "../services/pipeline.service";
import { SHIPMENT_FIELDS } from "../lib/fields";
import { MASTER_JOB_PROMPT } from "../lib/prompts";

const BATCH_SIZE = 3;

interface PipelineExtractHblRequest {
  sessionId: string;
  batchIndex: number;
}

interface PipelineExtractHblResponse {
  shipments: Record<string, string>[];
  batchIndex: number;
  totalBatches: number;
  totalExtracted: number;
  done: boolean;
}

export const pipelineExtractHbl = api(
  { expose: true, auth: false, method: "POST", path: "/extraction/pipeline/extract-hbl-batch" },
  async (req: PipelineExtractHblRequest): Promise<PipelineExtractHblResponse> => {
    const session = getSession(req.sessionId);
    if (!session) {
      throw APIError.notFound("Pipeline session not found or expired");
    }

    const hblPages = getPagesByType(req.sessionId, "HBL");
    const totalBatches = Math.ceil(hblPages.length / BATCH_SIZE);

    if (req.batchIndex >= totalBatches) {
      return {
        shipments: [],
        batchIndex: req.batchIndex,
        totalBatches,
        totalExtracted: session.shipments.length,
        done: true,
      };
    }

    const batch = hblPages.slice(
      req.batchIndex * BATCH_SIZE,
      (req.batchIndex + 1) * BATCH_SIZE,
    );

    const images = batch.map((p) => ({ base64: p.base64 }));
    const shipments = await extractFromImages(
      images,
      MASTER_JOB_PROMPT,
      `These are ${batch.length} House Bill of Lading pages. Each page = 1 shipment. For EACH page, extract a separate shipment object with fields: ${SHIPMENT_FIELDS.join(", ")}, and 'Personal Reference' (the House B/L number). Return a JSON array with exactly ${batch.length} objects.`,
      SHIPMENT_FIELDS,
      8192,
    );

    // Enrich with MBL shared info
    const MBL_SHARED_KEYS = [
      "POL", "POD", "Vessel", "Voyage", "Estimated Departure", "Estimated Arrival",
      "Shipping line / Coloader", "Booking Number", "Load Type",
    ];
    if (session.mblInfo) {
      for (const shipment of shipments) {
        for (const key of MBL_SHARED_KEYS) {
          if (!shipment[key] && session.mblInfo[key]) {
            shipment[key] = session.mblInfo[key];
          }
        }
      }
    }

    // Add to session
    session.shipments.push(...shipments);
    updateSession(req.sessionId, { shipments: session.shipments });

    const done = req.batchIndex + 1 >= totalBatches;

    return {
      shipments,
      batchIndex: req.batchIndex,
      totalBatches,
      totalExtracted: session.shipments.length,
      done,
    };
  },
);
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/services/extraction/controllers/pipeline*.ts
git commit -m "feat: add master job pipeline extraction endpoints"
```

---

### Task 6: Install Dependencies and Verify Backend

- [ ] **Step 1: Install pdf-parse**

```bash
cd /Users/marekmojzis/our_biz/shipment-tracker/apps/api
pnpm add pdf-parse
pnpm add -D @types/pdf-parse
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/marekmojzis/our_biz/shipment-tracker/apps/api
npx tsc --noEmit
```

Expected: no new errors from extraction service files.

- [ ] **Step 3: Regenerate API client**

```bash
cd /Users/marekmojzis/our_biz/shipment-tracker/apps/api
pnpm run gen:client
```

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat: add pdf-parse dependency for extraction service"
```

---

### Task 7: Frontend — DocumentReadingTab Component

**Files:**
- Create: `apps/web/src/app/shipments/_components/DocumentReadingTab.tsx`
- Modify: `apps/web/src/app/shipments/_components/ShipmentsView.tsx`

- [ ] **Step 1: Create DocumentReadingTab**

Create `apps/web/src/app/shipments/_components/DocumentReadingTab.tsx`:

```typescript
"use client";

import { useState, useCallback } from "react";
import { Upload, Button, Input, Segmented, Spin, Table, Checkbox, Select, Tag, Alert, Card, Space, message, Descriptions } from "antd";
import { InboxOutlined, FileTextOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { COLUMNS } from "@/lib/columnConfig";
import { getFieldValue, type ShipmentItem } from "@/hooks/useShipments";

type Destination = "fullsheet" | "invoicing" | "quote" | "masterjob";
type InputMode = "file" | "text";
type Step = "upload" | "extracting" | "review" | "committed";

interface ExtractedField {
  column: string;
  extractedValue: string;
  existingValue: string;
  hasConflict: boolean;
  approved: boolean;
}

interface InvoiceExtracted {
  total_amount?: string;
  currency?: string;
  vendor?: string;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  description?: string;
  service_type?: string;
}

// Map extracted field names to our API field names
const FIELD_NAME_MAP: Record<string, string> = {
  "Shipper": "shipper",
  "Consignee": "consignee",
  "Personal Reference": "personalReference",
  "Container Number": "containerNumber",
  "Booking Number": "bookingNumber",
  "Load Type": "loadType",
  "Shipping line / Coloader": "shippingLine",
  "POL": "pol",
  "POD": "pod",
  "Destination": "destination",
  "HS Code": "hsCode",
  "Cargo Description": "cargoDescription",
  "House BoL Number": "houseBolNumber",
  "Master BoL Number": "masterBolNumber",
  "House BoL Type": "houseBolType",
  "Master BoL Type": "masterBolType",
  "Vessel": "vessel",
  "Voyage": "voyage",
  "PCS": "pcs",
  "Total Weight In Tons": "totalWeightTons",
  "Total Volume In CBM": "totalVolumeCbm",
  "Cargo Origin": "cargoOrigin",
  "Country code": "countryCode",
  "Origin": "origin",
  "Estimated Departure": "estimatedDeparture",
  "Estimated Arrival": "estimatedArrival",
  "Trade Direction": "tradeDirection",
  "Agent": "agent",
  "Incoterm Origin": "incotermOrigin",
  "Incoterm Destination": "incotermDestination",
  "Commercial Invoice Value": "commercialInvoiceValue",
};

function normalizeExtracted(raw: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    let v = value;
    if (key === "Load Type") {
      if (v === "FCL") v = "Full Load";
      else if (v === "LCL") v = "Consolidation";
    }
    if (key === "Trade Direction") {
      if (v === "IMP") v = "Import";
      else if (v === "EXP") v = "Export";
    }
    result[key] = v;
  }
  return result;
}

const COST_CATEGORIES = [
  { value: "freight", label: "Freight" },
  { value: "collection", label: "Collection/Delivery" },
  { value: "locals", label: "Locals" },
  { value: "others", label: "Others" },
  { value: "insurance", label: "Insurance" },
  { value: "customs", label: "Customs clearance" },
];

interface DocumentReadingTabProps {
  shipments: ShipmentItem[];
}

export function DocumentReadingTab({ shipments }: DocumentReadingTabProps) {
  const queryClient = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();

  const [destination, setDestination] = useState<Destination>("fullsheet");
  const [inputMode, setInputMode] = useState<InputMode>("file");
  const [step, setStep] = useState<Step>("upload");
  const [fileBase64, setFileBase64] = useState("");
  const [fileName, setFileName] = useState("");
  const [textInput, setTextInput] = useState("");

  // Fullsheet / Quote review
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [targetShipmentId, setTargetShipmentId] = useState<string>("");
  const [extractionMethod, setExtractionMethod] = useState("");

  // Invoice review
  const [invoiceData, setInvoiceData] = useState<InvoiceExtracted>({});
  const [selectedCategory, setSelectedCategory] = useState("");
  const [invoiceTargetShipmentId, setInvoiceTargetShipmentId] = useState("");

  // Master Job pipeline
  const [pipelineSessionId, setPipelineSessionId] = useState("");
  const [pipelineClassification, setPipelineClassification] = useState<Record<string, number>>({});
  const [masterShipments, setMasterShipments] = useState<Record<string, string>[]>([]);
  const [masterCurrentIdx, setMasterCurrentIdx] = useState(0);
  const [pipelineStep, setPipelineStep] = useState<"idle" | "classifying" | "classified" | "extracting" | "ready">("idle");

  const handleFileSelect = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1] || "";
      setFileBase64(base64);
      setFileName(file.name);
    };
    reader.readAsDataURL(file);
    return false; // prevent antd auto upload
  }, []);

  const handleExtract = async () => {
    setStep("extracting");
    try {
      if (destination === "fullsheet") {
        const result = inputMode === "file"
          ? await api.extraction.extractDocument({ fileBase64, fileName })
          : await api.extraction.extractText({ text: textInput, destination: "shipment" });

        const normalized = normalizeExtracted(result.extracted);
        setExtractionMethod(result.method);

        // Build field list with conflict detection
        const target = shipments.find((s) => s.id === targetShipmentId);
        const fieldList: ExtractedField[] = Object.entries(normalized).map(([col, extractedValue]) => {
          const apiField = FIELD_NAME_MAP[col] || col;
          const existingValue = target ? getFieldValue(target, apiField) : "";
          return {
            column: col,
            extractedValue,
            existingValue,
            hasConflict: !!existingValue && existingValue !== extractedValue,
            approved: !existingValue || existingValue === extractedValue, // auto-approve if no conflict
          };
        });
        setFields(fieldList);
        setStep("review");

      } else if (destination === "invoicing") {
        const result = inputMode === "file"
          ? await api.extraction.extractInvoice({ fileBase64, fileName })
          : await api.extraction.extractText({ text: textInput, destination: "invoicing" });

        setInvoiceData(result.extracted);
        if (result.extracted.service_type) {
          const cat = COST_CATEGORIES.find((c) => c.value === result.extracted.service_type);
          if (cat) setSelectedCategory(cat.value);
        }
        setStep("review");

      } else if (destination === "quote") {
        const result = inputMode === "file"
          ? await api.extraction.extractQuote({ fileBase64, fileName })
          : await api.extraction.extractText({ text: textInput, destination: "quote" });

        const normalized = normalizeExtracted(result.extracted);
        const fieldList: ExtractedField[] = Object.entries(normalized).map(([col, extractedValue]) => ({
          column: col,
          extractedValue,
          existingValue: "",
          hasConflict: false,
          approved: true,
        }));
        setFields(fieldList);
        setStep("review");

      } else if (destination === "masterjob") {
        setPipelineStep("classifying");
        const result = await api.extraction.pipelinePrepare({ fileBase64, fileName });
        setPipelineSessionId(result.sessionId);
        setPipelineClassification(result.classification);
        setPipelineStep("classified");
        setStep("review");
      }
    } catch (err) {
      messageApi.error("Extraction failed. Please try again.");
      setStep("upload");
    }
  };

  const handleStartMasterExtraction = async () => {
    setPipelineStep("extracting");
    try {
      // Phase 2a: Extract MBL
      await api.extraction.pipelineExtractMbl({ sessionId: pipelineSessionId });

      // Phase 2b: Extract HBL batch 0
      const hblResult = await api.extraction.pipelineExtractHbl({ sessionId: pipelineSessionId, batchIndex: 0 });
      setMasterShipments(hblResult.shipments);
      setMasterCurrentIdx(0);
      setPipelineStep("ready");
    } catch {
      messageApi.error("Pipeline extraction failed");
      setPipelineStep("classified");
    }
  };

  const handleCommitFullsheet = async () => {
    const approved = fields.filter((f) => f.approved);
    if (approved.length === 0) {
      messageApi.warning("No fields approved");
      return;
    }

    const updateData: Record<string, string> = {};
    for (const f of approved) {
      const apiField = FIELD_NAME_MAP[f.column] || f.column;
      updateData[apiField] = f.extractedValue;
    }

    try {
      if (targetShipmentId) {
        await api.shipments.shipmentUpdate(targetShipmentId, updateData);
      } else {
        // Create new shipment
        const maxNum = shipments.reduce((max, s) => {
          if (s.jobNumber?.startsWith("CZ") && !s.jobNumber.startsWith("CZQ")) {
            const num = parseInt(s.jobNumber.substring(2), 10);
            return isNaN(num) ? max : Math.max(max, num);
          }
          return max;
        }, 0);
        const jobNumber = `CZ${String(maxNum + 1).padStart(8, "0")}`;
        await api.shipments.shipmentCreate({
          jobNumber,
          status: "Booking Confirmation Pending [IMP]",
          tradeDirection: updateData.tradeDirection || "Import",
          customsStatus: "Waiting For Commercial Paperwork",
          ...updateData,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
      messageApi.success("Data committed successfully");
      setStep("committed");
    } catch {
      messageApi.error("Failed to commit data");
    }
  };

  const handleCommitInvoice = async () => {
    if (!selectedCategory) {
      messageApi.warning("Please select a cost category");
      return;
    }
    if (!invoiceTargetShipmentId) {
      messageApi.warning("Please select a target shipment");
      return;
    }

    try {
      await api.invoicing.invoicingUpsertCost(invoiceTargetShipmentId, {
        category: selectedCategory,
        realAmount: invoiceData.total_amount || "",
        realCurrency: invoiceData.currency || "CZK",
        invoiceNumber: invoiceData.invoice_number || "",
        vendor: invoiceData.vendor || "",
      });
      queryClient.invalidateQueries({ queryKey: ["invoicing"] });
      messageApi.success("Invoice data committed");
      setStep("committed");
    } catch {
      messageApi.error("Failed to commit invoice data");
    }
  };

  const handleReset = () => {
    setStep("upload");
    setFileBase64("");
    setFileName("");
    setTextInput("");
    setFields([]);
    setInvoiceData({});
    setSelectedCategory("");
    setTargetShipmentId("");
    setInvoiceTargetShipmentId("");
    setPipelineSessionId("");
    setPipelineClassification({});
    setMasterShipments([]);
    setMasterCurrentIdx(0);
    setPipelineStep("idle");
    setExtractionMethod("");
  };

  const toggleFieldApproval = (idx: number) => {
    setFields((prev) => prev.map((f, i) => i === idx ? { ...f, approved: !f.approved } : f));
  };

  const shipmentOptions = shipments.map((s) => ({
    value: s.id,
    label: `${s.jobNumber} — ${s.shipper || s.consignee || ""}`,
  }));

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      {contextHolder}

      <div style={{ marginBottom: 16 }}>
        <Segmented
          value={destination}
          onChange={(v) => { setDestination(v as Destination); handleReset(); }}
          options={[
            { value: "fullsheet", label: "Shipment" },
            { value: "invoicing", label: "Invoice" },
            { value: "quote", label: "Quote" },
            { value: "masterjob", label: "Master Job" },
          ]}
        />
      </div>

      {/* Step: Upload */}
      {step === "upload" && (
        <Card>
          {destination !== "masterjob" && (
            <div style={{ marginBottom: 16 }}>
              <Segmented
                size="small"
                value={inputMode}
                onChange={(v) => setInputMode(v as InputMode)}
                options={[
                  { value: "file", label: "Upload File" },
                  { value: "text", label: "Paste Text" },
                ]}
              />
            </div>
          )}

          {(inputMode === "file" || destination === "masterjob") && (
            <Upload.Dragger
              accept=".pdf,.jpg,.jpeg,.png"
              beforeUpload={handleFileSelect}
              showUploadList={false}
              style={{ marginBottom: 16 }}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">{fileName || "Click or drag a file (PDF, JPG, PNG)"}</p>
            </Upload.Dragger>
          )}

          {inputMode === "text" && destination !== "masterjob" && (
            <Input.TextArea
              rows={6}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Paste document text here (max 1500 characters)..."
              maxLength={1500}
              showCount
              style={{ marginBottom: 16 }}
            />
          )}

          {/* Target shipment selector for fullsheet */}
          {destination === "fullsheet" && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>
                Update existing shipment (or leave empty to create new):
              </label>
              <Select
                showSearch
                allowClear
                style={{ width: "100%" }}
                placeholder="Select shipment..."
                value={targetShipmentId || undefined}
                onChange={(v) => setTargetShipmentId(v || "")}
                options={shipmentOptions}
                filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
              />
            </div>
          )}

          {/* Target shipment for invoicing */}
          {destination === "invoicing" && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>
                Target shipment for invoice costs:
              </label>
              <Select
                showSearch
                style={{ width: "100%" }}
                placeholder="Select shipment..."
                value={invoiceTargetShipmentId || undefined}
                onChange={(v) => setInvoiceTargetShipmentId(v || "")}
                options={shipmentOptions}
                filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
              />
            </div>
          )}

          <Button
            type="primary"
            icon={<FileTextOutlined />}
            onClick={handleExtract}
            disabled={inputMode === "file" ? !fileBase64 : !textInput.trim()}
          >
            Extract Data
          </Button>
        </Card>
      )}

      {/* Step: Extracting */}
      {step === "extracting" && (
        <Card>
          <div style={{ textAlign: "center", padding: 40 }}>
            <Spin size="large" />
            <p style={{ marginTop: 16, color: "#64748b" }}>Extracting data with AI...</p>
          </div>
        </Card>
      )}

      {/* Step: Review — Fullsheet / Quote */}
      {step === "review" && (destination === "fullsheet" || destination === "quote") && (
        <Card>
          <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>{fields.length} fields extracted</strong>
              {extractionMethod && <Tag style={{ marginLeft: 8 }}>{extractionMethod}</Tag>}
            </div>
            <Space>
              <Button onClick={handleReset}>Back</Button>
              <Button type="primary" onClick={handleCommitFullsheet}>
                Commit {fields.filter((f) => f.approved).length} Fields
              </Button>
            </Space>
          </div>
          <Table
            size="small"
            pagination={false}
            dataSource={fields.map((f, i) => ({ ...f, key: i }))}
            columns={[
              {
                title: "",
                width: 40,
                render: (_, record, idx) => (
                  <Checkbox checked={record.approved} onChange={() => toggleFieldApproval(idx)} />
                ),
              },
              { title: "Field", dataIndex: "column", width: 200 },
              { title: "Extracted", dataIndex: "extractedValue", ellipsis: true },
              {
                title: "Existing",
                dataIndex: "existingValue",
                ellipsis: true,
                render: (v: string) => v || <span style={{ color: "#d1d5db" }}>—</span>,
              },
              {
                title: "Conflict",
                width: 70,
                render: (_, record) => record.hasConflict ? <Tag color="orange">!</Tag> : null,
              },
            ]}
          />
        </Card>
      )}

      {/* Step: Review — Invoice */}
      {step === "review" && destination === "invoicing" && (
        <Card>
          <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
            <strong>Invoice Data Extracted</strong>
            <Space>
              <Button onClick={handleReset}>Back</Button>
              <Button type="primary" onClick={handleCommitInvoice}>Commit Invoice</Button>
            </Space>
          </div>
          <Descriptions bordered size="small" column={2} items={[
            { key: "amount", label: "Amount", children: invoiceData.total_amount || "—" },
            { key: "currency", label: "Currency", children: invoiceData.currency || "—" },
            { key: "vendor", label: "Vendor", children: invoiceData.vendor || "—" },
            { key: "invoiceNo", label: "Invoice #", children: invoiceData.invoice_number || "—" },
            { key: "invoiceDate", label: "Invoice Date", children: invoiceData.invoice_date || "—" },
            { key: "dueDate", label: "Due Date", children: invoiceData.due_date || "—" },
            { key: "description", label: "Description", children: invoiceData.description || "—", span: 2 },
          ]} />
          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Cost Category:</label>
            <Select
              style={{ width: 300 }}
              value={selectedCategory || undefined}
              onChange={setSelectedCategory}
              placeholder="Select category..."
              options={COST_CATEGORIES}
            />
          </div>
        </Card>
      )}

      {/* Step: Review — Master Job */}
      {step === "review" && destination === "masterjob" && (
        <Card>
          {pipelineStep === "classified" && (
            <div>
              <strong>Pages Classified</strong>
              <div style={{ display: "flex", gap: 12, margin: "12px 0" }}>
                {Object.entries(pipelineClassification).map(([type, count]) => (
                  <Tag key={type} color={type === "SKIP" ? "default" : "blue"}>{type}: {count}</Tag>
                ))}
              </div>
              <Space>
                <Button onClick={handleReset}>Back</Button>
                <Button type="primary" onClick={handleStartMasterExtraction}>Start Extraction</Button>
              </Space>
            </div>
          )}

          {pipelineStep === "extracting" && (
            <div style={{ textAlign: "center", padding: 40 }}>
              <Spin size="large" />
              <p style={{ marginTop: 16, color: "#64748b" }}>Extracting shipments from pages...</p>
            </div>
          )}

          {pipelineStep === "ready" && masterShipments.length > 0 && (
            <div>
              <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
                <strong>Shipment {masterCurrentIdx + 1} of {masterShipments.length}</strong>
                <Space>
                  <Button disabled={masterCurrentIdx === 0} onClick={() => setMasterCurrentIdx((i) => i - 1)}>Prev</Button>
                  <Button disabled={masterCurrentIdx >= masterShipments.length - 1} onClick={() => setMasterCurrentIdx((i) => i + 1)}>Next</Button>
                  <Button onClick={handleReset}>Done</Button>
                </Space>
              </div>
              <Descriptions bordered size="small" column={2}
                items={Object.entries(masterShipments[masterCurrentIdx] || {}).map(([key, value]) => ({
                  key,
                  label: key,
                  children: value || "—",
                }))}
              />
            </div>
          )}

          {pipelineStep === "ready" && masterShipments.length === 0 && (
            <Alert message="No shipments extracted" type="warning" showIcon />
          )}
        </Card>
      )}

      {/* Step: Committed */}
      {step === "committed" && (
        <Card>
          <Alert
            message="Data committed successfully"
            type="success"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Button type="primary" onClick={handleReset}>Extract Another</Button>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add DocumentReadingTab to ShipmentsView**

Modify `apps/web/src/app/shipments/_components/ShipmentsView.tsx`:

Add import at top:
```typescript
import { DocumentReadingTab } from "./DocumentReadingTab";
```

Update the `Segmented` options to add "Extract":
```typescript
<Segmented
  size="small"
  value={view}
  onChange={(v) => setView(v as "shipments" | "dashboard" | "extract")}
  options={[
    { value: "shipments", label: "Shipments" },
    { value: "dashboard", label: "Dashboard" },
    { value: "extract", label: "Extract" },
  ]}
/>
```

Update the `view` state type:
```typescript
const [view, setView] = useState<"shipments" | "dashboard" | "extract">("shipments");
```

Add the extract view in the conditional rendering (after the dashboard block, before the closing of the ternary):
```typescript
) : view === "extract" ? (
  <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
    <DocumentReadingTab shipments={shipments} />
  </div>
) : (
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/shipments/_components/DocumentReadingTab.tsx
git add apps/web/src/app/shipments/_components/ShipmentsView.tsx
git commit -m "feat: add document extraction UI with upload, review, and commit"
```

---

### Task 8: Verify End-to-End

- [ ] **Step 1: Check backend TypeScript**

```bash
cd /Users/marekmojzis/our_biz/shipment-tracker/apps/api
npx tsc --noEmit
```

- [ ] **Step 2: Check frontend TypeScript**

```bash
cd /Users/marekmojzis/our_biz/shipment-tracker/apps/web
npx tsc --noEmit
```

- [ ] **Step 3: Test extraction endpoint manually**

Start the backend with `encore run`, then test with a simple text extraction:

```bash
curl -X POST http://localhost:4001/extraction/text \
  -H "Content-Type: application/json" \
  -d '{"text": "Shipper: ABC Corp, Consignee: XYZ Ltd, POL: Shanghai, POD: Rotterdam, Container: MSMU1234567", "destination": "shipment"}'
```

Expected: JSON with extracted fields (Shipper, Consignee, POL, POD, Container Number).

- [ ] **Step 4: Test frontend**

Start `npm run dev` in apps/web. Navigate to Shipments → click "Extract" tab → paste text → click Extract → review fields → commit.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete document extraction feature with backend and frontend"
```
