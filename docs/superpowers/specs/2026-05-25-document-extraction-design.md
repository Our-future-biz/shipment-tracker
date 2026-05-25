# Document Extraction via Anthropic API

## Context

The POC shipment tracker had document extraction powered by Claude (Anthropic SDK). Users upload shipping documents (bills of lading, invoices, quotes, manifests) and the system extracts structured data using Claude's text and vision capabilities. This feature needs to be ported to the production Encore.dev backend with a React/Ant Design frontend.

## Scope

- 4 single-document extraction endpoints (shipment, invoice, quote, text)
- 3 pipeline endpoints for multi-page Master Job processing
- Frontend UI for upload, review, and commit workflows
- Pure Node.js PDF processing (pdf-lib + sharp, no system dependencies)

## Backend: New `extraction` Service

### Service Structure

```
apps/api/services/extraction/
  encore.service.ts
  controllers/
    extractDocument.controller.ts      # POST /extraction/document
    extractInvoice.controller.ts       # POST /extraction/invoice
    extractQuote.controller.ts         # POST /extraction/quote
    extractText.controller.ts          # POST /extraction/text
    pipelinePrepare.controller.ts      # POST /extraction/pipeline/prepare
    pipelineExtractMbl.controller.ts   # POST /extraction/pipeline/extract-mbl
    pipelineExtractHbl.controller.ts   # POST /extraction/pipeline/extract-hbl-batch
  services/
    extraction.service.ts              # Claude API calls, PDF processing
    pipeline.service.ts                # Session management, multi-phase logic
  lib/
    prompts.ts                         # System prompts for each extraction type
    fields.ts                          # Extractable field lists
    pdf.ts                             # PDF text extraction and image conversion
```

No database tables needed — pipeline sessions are in-memory (temporary extraction state).

### Dependencies

- `@anthropic-ai/sdk` — Claude API client
- `pdf-lib` — PDF parsing and text extraction
- `sharp` — PDF page to PNG conversion for vision API

### Endpoints

#### Single Document Extraction

All accept file upload (PDF, JPEG, PNG) via Encore's raw endpoint pattern.

**POST /extraction/document**
- Input: File upload (multipart or raw body)
- Processing: text extraction first, vision fallback
- System prompt: Shipping document extraction (BL, booking confirmation, manifest)
- Fields: Shipper, Consignee, Container Number, POL, POD, Vessel, etc. (52 fields)
- Response: `{ extracted: Record<string, string>, fieldCount: number, method: "text"|"vision", fileName: string }`

**POST /extraction/invoice**
- Input: File upload
- System prompt: Invoice/cost extraction
- Fields: total_amount, currency, vendor, invoice_number, invoice_date, due_date, description, service_type (8 fields)
- Response: same shape

**POST /extraction/quote**
- Input: File upload
- System prompt: Quote/rate request extraction
- Fields: Shipper, Consignee, POL, POD, Volume, Weight, etc. (21 fields)
- Response: same shape

**POST /extraction/text**
- Input: JSON body `{ text: string, destination: "shipment"|"invoicing"|"quote" }`
- No file — extracts from raw text (max 1500 chars)
- Selects prompt and field list based on destination
- Response: same shape

#### Master Job Pipeline

**POST /extraction/pipeline/prepare**
- Input: File upload (multi-page PDF)
- Processing:
  1. Convert each page to low-res PNG (72 DPI) for classification
  2. Convert each page to high-res PNG (150 DPI) for extraction
  3. Classify pages in batches of 10 using Claude Vision: MANIFEST, HBL, MBL, or SKIP
  4. Store session in-memory
- Response: `{ sessionId, pageCount, classification: { MANIFEST, HBL, MBL, SKIP }, pages: Array<{ pageNum, type }> }`

**POST /extraction/pipeline/extract-mbl**
- Input: `{ sessionId: string }`
- Processing: Send MBL pages to Claude Vision, extract shared shipping info (vessel, POL/POD, ETD/ETA, shipping line, booking, containers)
- Response: `{ mblInfo: Record<string, string> | null }`

**POST /extraction/pipeline/extract-hbl-batch**
- Input: `{ sessionId: string, batchIndex: number }`
- Processing:
  1. Take batch of 3 HBL pages
  2. Send to Claude Vision with master job system prompt
  3. Parse array of shipment objects
  4. Enrich each with MBL shared info
- Response: `{ shipments: Record<string, string>[], batchIndex, totalBatches, totalExtracted, done: boolean }`

### PDF Processing Flow

```
Input file
  |
  +--> Image? --> Claude Vision API --> parsed JSON
  |
  +--> PDF?
         |
         +--> pdf-lib: extract text
         |      |
         |      +--> text >= 20 chars? --> Claude text API --> parsed JSON
         |      |
         |      +--> text too short (scanned PDF)
         |
         +--> sharp: render pages as PNG --> Claude Vision API --> parsed JSON
```

### System Prompts

Four distinct prompts (ported from POC):

1. **SHIPMENT_PROMPT** — Extracts from BL, Sea Waybills, Booking Confirmations, Manifests. Dates as MM/DD/YY. Load type: "FCL"/"LCL". BoL type: "OBL"/"SWB"/"TLX". Container type: "DRY"/"REEFER"/"OT"/"FR"/"TANK".

2. **INVOICE_PROMPT** — Extracts cost data. Amount without currency symbol. Currency as ISO 4217. Service type mapped to: freight, collection, locals, others, insurance, customs.

3. **QUOTE_PROMPT** — Extracts from rate requests, quotation requests, booking inquiries. Volume in CBM, Weight in KGS.

4. **MASTER_JOB_PROMPT** — Handles 3 page types: MANIFEST (multiple shipments in blocks), HBL (one shipment per page), MBL (shared info only, marked with `__type__: "MBL"`).

### Claude API Configuration

- Model: `claude-sonnet-4-5-20241022` (configurable via env var `ANTHROPIC_MODEL`)
- Max tokens: 2048 for single docs, 8192 for HBL batch extraction, 1024 for invoices
- API key: via `ANTHROPIC_API_KEY` env var (standard Anthropic SDK pattern)

### Validation

- Extracted fields are validated against the relevant field list
- Only string values that are non-empty after trim are kept
- JSON parsed from Claude response using regex match for `{...}` or `[...]`

### Pipeline Session Storage

In-memory `Map<string, PipelineSession>`:
```ts
interface PipelineSession {
  pages: Array<{ pageNum: number; type: string; base64: string }>;
  mblInfo: Record<string, string> | null;
  shipments: Record<string, string>[];
  fileName: string;
  createdAt: number; // for cleanup
}
```
Sessions auto-expire after 30 minutes (cleanup on access).

## Frontend: DocumentReadingTab

### Location

New component: `apps/web/src/app/shipments/_components/DocumentReadingTab.tsx`

Accessible from ShipmentsView via a new toolbar button or tab.

### Workflow Steps

1. **Upload** — Select destination (Full Sheet / Invoicing / Quote / Master Job), upload file or paste text
2. **Extracting** — Show spinner while Claude processes
3. **Review** — Display extracted fields, highlight conflicts with existing data, allow field-level approve/reject
4. **Commit** — Save approved data to the appropriate API

### UI Components

**Step 1: Upload**
- `Segmented` for destination selection
- `Upload.Dragger` for file (accepts .pdf, .jpg, .png)
- `Input.TextArea` for text mode (toggle between file/text)
- "Extract" button

**Step 2: Extracting**
- `Spin` with message "Extracting data..."
- For Master Job: show classification results first, then "Start Extraction" button

**Step 3: Review**
- **Full Sheet / Quote:** Table of fields with columns: Field Name, Extracted Value, Existing Value, Conflict indicator, Approve checkbox
- **Invoicing:** Form showing extracted invoice fields + cost category selector (dropdown)
- **Master Job:** Card per shipment with same field review table, navigation between shipments

**Step 4: Commit**
- Full Sheet: calls `api.shipments.shipmentUpdate()` or `api.shipments.shipmentCreate()`
- Invoicing: calls `api.invoicing.invoicingUpsertCost()`
- Quote: calls `api.quotes.quoteUpdate()`
- Master Job: creates shipments one by one, then links to MCZ

### Field Normalization

Before review, normalize extracted values:
- Load Type: "FCL" -> "Full Load", "LCL" -> "Consolidation"
- Trade Direction: "IMP" -> "Import", "EXP" -> "Export"
- Derive Freight Mode from vessel/container presence if not explicitly extracted

### Conflict Detection

For Full Sheet and Quote modes:
- Compare each extracted field against existing shipment/quote values
- If existing value is non-empty and differs from extracted → mark as conflict
- Conflicts default to "not approved" — user must explicitly approve overwrite

## Error Handling

- File too large: reject at upload (10MB limit)
- Unsupported file type: reject with message
- Claude API failure: show error toast, allow retry
- JSON parse failure from Claude: show error, allow retry
- Pipeline session expired: show error, require re-upload

## Verification

1. Upload a sample BL PDF → verify shipment fields extracted correctly
2. Upload a sample invoice → verify cost data extracted
3. Upload a multi-page PDF → verify page classification and batch extraction
4. Commit extracted data → verify it appears in the shipment/invoice/quote
5. Test conflict detection with existing data
6. Test text extraction mode
7. Test vision fallback with scanned PDF
