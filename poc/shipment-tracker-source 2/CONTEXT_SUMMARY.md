# Shipment Tracker Dashboard — Full Context Summary

**Use this prompt when starting a new thread to recreate/continue work on this application.**

---

## Project Overview

A full-stack shipment tracking operations dashboard built with Express + Vite + React + Tailwind CSS + shadcn/ui + Drizzle ORM + SQLite. Dark theme, logistics-focused.

- **Project root**: `/home/user/workspace/shipment-dashboard/`
- **Site**: "Shipment Tracker Dashboard"
- **Asset ID**: `668b4ec1-2a7a-4dbb-a9f2-32d74864869e`
- **Company name in PDFs**: "ABC, domcekova 16, Praha 5"

### Deploy process
```
npm run build → start_server(command="NODE_ENV=production node dist/index.cjs", port=5000, api_credentials=["llm-api:website", "external-tools"]) → deploy_website(project_path="<project>/dist/public", site_name="Shipment Tracker Dashboard", entry_point="index.html")
```
- `queryClient.ts` uses `__PORT_5000__` placeholder pattern
- For automation emails: server needs `api_credentials=["external-tools"]`

---

## User Accounts
- `lukas@ourfuture.biz` / `aboGi6Un8fpzezA` (admin)
- `ad@ourfuture.biz` / `admin2025` (admin)
- `martin@ourfuture.biz` / `Rw3&mZp8KxJ5Vn` (user)
- `marek@ourfuture.biz` / `Vx7#nKq4RwL9Tp` (user)

---

## User Instructions (CRITICAL — preserve verbatim)
- "go with facts only, no guessing/guesswork allowed. reliable sources only."
- "in case I am wrong speak up with reference to the arguments."
- "odpovědi kompromis mezi formální a neformální."
- "stručné a věcné odpovědi, kde je v minimu textu shrnuto vše"
- "jakékoliv názory jsou vítány, dobrého výsledku a porozumění lze dosáhnout pouze sdílením názorů a následnou debatou k danému tématu. Be innovative and think outside the box. Get right to the point. Take a forward-thinking view."
- "the main idea is to keep what you created, because I like it a lot, and build all these functions and options to 'Full Sheet'"
- DO NOT modify DashboardTab.tsx
- Document Reading: **No overwrite** — if fields already have data, user must be notified and approve replacement
- Document Reading: **Review step** before data is committed to the row
- Job Number column in Full Sheet is system-generated and NOT editable after creation
- "Created by" column is system-generated, NOT editable, always last column position
- Company name in PDFs: "ABC, domcekova 16, Praha 5" (replaced Poolside Logistics)

---

## Architecture

### Tabs (in order)
1. **Dashboard** — KPI cards + charts (DO NOT MODIFY)
2. **Full Sheet** — Main spreadsheet with 98 columns, ~70+ base shipments
3. **Document/Text Reading** — AI-powered document extraction (4 destinations: Full Sheet, Invoicing, Quote, Master Job)
4. **Invoicing** — Invoice management with cost sections
5. **Quote** — Quote management with Quote Detail Card

### Key Components
| File | Description |
|------|-------------|
| `FullSheetTab.tsx` (~2250 lines) | Main spreadsheet with frozen panes, column reorder, filters, Master Job management |
| `QuoteTab.tsx` (~1420 lines) | Quote spreadsheet with inline editing, cost section, Quote Detail Card |
| `DocumentReadingTab.tsx` (~1785 lines) | Document extraction with 4 destinations including Master Job batch processing |
| `QuoteDetailModal.tsx` (~633 lines) | Quote card popup with 4 tabs |
| `QuoteCostSection.tsx` (~1121 lines) | Costs, billing, print quote, booked workflow |
| `ShipmentDetailModal.tsx` (~1567 lines) | Shipment card with 4 tabs (Details, Costs, Documents, Tracking) |
| `InvoicingTab.tsx` (~973 lines) | Invoice management |
| `ChatPanel.tsx` | Threaded comments panel (used for both Job and Master Job) |
| `AttachmentsPanel.tsx` | File attachments panel (used for both Job and Master Job) |
| `LoginScreen.tsx` | Login with email/password + eye toggle |
| `Home.tsx` | Tab container with auth gate |

### Data Layer
| File | Description |
|------|-------------|
| `shipment-data.ts` | 98 COLUMNS array + base SHIPMENTS data (~70 rows) + getColumnValue mapping |
| `column-config.ts` | Column widths, dropdown options, conditional formatting, checkbox/date columns |
| `shipment-context.tsx` | React context: data state, CRUD operations, edit persistence, refreshFromAPI |
| `auth-context.tsx` | Auth context with login/logout |
| `shared/schema.ts` | Drizzle ORM schema (14 tables) |
| `server/storage.ts` | All CRUD methods for all tables |
| `server/routes.ts` (~1527 lines) | All API endpoints + automation rules + AI extraction |

---

## Full Sheet Features

### Column Layout (Frozen Pane — always locked, non-draggable)
```
🔒 Job number → 💬 chat → 📎 attach → 🔒 Master job → 💬 master chat → 📎 master attach → [scrollable columns...]
```
- Default freeze count: 2 (Job number + Master job)
- Both locked columns have lock icons, no grip handles
- Chat/attach icons for Job are teal; for Master Job are amber
- Light orange background highlight on Job number + Master job cells for grouped shipments

### Number Sequences
| Prefix | Example | Use |
|--------|---------|-----|
| CZ | CZ25010076 | Job numbers (8-digit padded) |
| CZQ | CZQ00000001 | Quote numbers |
| MCZ | MCZ00000001 | Master Job numbers |

All three use soft-delete-aware number generation (scans edit history to avoid collisions).

### Soft Delete
- **Shipments**: Records a `"delete"` edit action, data stays in DB, hidden from UI
- **Quotes**: Sets `__deleted__: true` in data JSON blob, filtered on GET
- Number sequences are never broken — deleted numbers are skipped
- Confirmation dialogs say "hidden but kept in the database"

### Master Job Feature
- "Add to Master Job" amber button in toolbar
- Two-step dialog: Choose mode (Create new MCZ / Add to existing) → Select shipments (checkboxes with search) → Confirm
- Existing MCZ list scans ALL edit history (MCZ numbers are permanent, never fully hidden)
- Unlink icon (🔗) next to MCZ number with confirmation dialog: "Remove from Master Job"
- Master Job chat and attachments — shared across all shipments in the MCZ group

### Double-Click Protection
- "Create Shipment" buttons (in Booked dialog + Copy Estimated Costs dialog) disable after first click
- Shows "Creating..." state, prevents duplicate shipments

### Automation Rules (24 rules in routes.ts)
- **5 General rules**: Department changes (OPS with Backup[Vacation] override, CUSTOMS, TRUCKING, AD, ACCOUNTING)
- **9 IMP rules**: Status-based for import shipments
- **10 EXP rules**: Status-based for export shipments
- OPS rule: If `Backup [Vacation]` has a value → that person receives notifications instead of `Job handled by`
- Emails go to "Job handled by" field (not hardcoded), sent via Outlook connector

### Column Details
- 98 columns total in COLUMNS array
- "Created by" — auto-filled with CET datetime + creator email, always last position, non-editable
- "Master job" — system-assigned MCZ number, non-editable, column position 2 (after Job number)
- Status dropdown dynamically filters by Shipment type (IMP/EXP)
- Department dropdown includes: OPS, CUSTOMS, TRUCKING, AD, ACCOUNTING
- Conditional formatting on Status, Customs status columns

---

## Quote Tab Features

### Quote Columns
Quote number, Shipper, Consignee, Service (dropdown: SEA/AIR/RAIL/ROAD), Shipment type, FCL/LCL, Agent, PIC email, INCOTERM ORIGIN, Incoterm destination, Cargo origin, Origin, POL, POD, Destination, HS code, Goods description, Volume, Weight, Number of pieces, CNTR count/length/type [1-4], Vessel/Voyage, ETD date, ETA date

### Quote Detail Card (QuoteDetailModal)
Opens when clicking a quote number. 4 tabs:
1. **Shipment Details** — Quote Overview, Route, Cargo Details, Service Info (2-column layout)
2. **Costs Breakdown** — Full QuoteCostSection (suppliers costs table, billing currency/ROE, additional charges, summary bar with profit, Print Quote, Booked button, Generated Invoices with InvoiceChip)
3. **Documents** — Drag-and-drop file upload
4. **Terms & Conditions** — Auto-saving textarea (stored as `__terms__` in quote data JSON)

Header: Service badge (e.g. "AIR IMPORT"), quote number, route, 3 action icons (maximize, popout, copy)

### Booked Workflow
QuoteCostSection "Booked" button → Select invoice → Confirm → Creates new CZ shipment in Full Sheet with linked quote reference + optional cost copy

---

## Document/Text Reading Features

### 4 Destinations
1. **Full Sheet** — Extract to existing/new shipment
2. **Invoicing** — Extract invoice/cost data
3. **Quote** — Extract quote data
4. **Master Job** — Extract multiple shipments from pre-alert documents (NEW)

### Master Job Extraction (batch processing)
**Flow:**
1. Upload PDF/image → Server extracts text (or converts scanned pages to images at 150 DPI)
2. For scanned PDFs: pages are grouped into chunks of 2 pages each
3. For text PDFs: text is split on BL boundaries (~8000 chars/chunk)
4. First chunk is extracted immediately → shows results for review
5. User processes shipments one at a time (Validate & Create / Edit / Skip)
6. "Load Next Batch" button to extract next chunk
7. Each validated shipment creates a new CZ job linked to the MCZ

**Three document types recognized:**
- **Manifest / Cargo List** — Primary source for counting shipments. Each block with unique reference = 1 shipment
- **House Bill of Lading (HBL)** — Full-page BL = 1 shipment
- **Master Bill of Lading (MBL)** — Consolidated cargo list. NOT counted as shipments. Extracts shared info (vessel, POL, POD, ETD, containers) and applies to all shipments

**Server endpoints:**
- `POST /api/master-job-prepare` — Upload file, extract text/images, split into chunks, return storeId + chunk count
- `POST /api/master-job-extract-chunk` — Process one chunk, return extracted shipments + MBL info

**MCZ selector:** Create new / Add to existing (radio buttons + dropdown of all existing MCZ numbers)

### Existing Document Reading
- PDF + image support (text extraction + OCR/vision fallback via pdftoppm + Anthropic vision)
- No-overwrite rule: existing field values require user approval before replacement
- Review step before committing data

---

## Invoicing Features

### Cost Categories
Freight, Collection/Delivery, Locals, Others, Insurance, Customs clearance

### Invoice Generation (jsPDF)
- Breakdown vs Total print modes
- InvoiceChip popup: Download PDF / Show Costs
- Quote import accepts full invoice numbers (CZQ00000001-001) and strips suffix

### Billing
- Billing Currency selector (CZK/USD/EUR/GBP/CNY)
- ROE (Rate of Exchange) field
- Billing overrides per cost category
- Summary bar: Suppliers Costs, Billing total, Profit

---

## Shipment Detail Card (ShipmentDetailModal)

Opens when clicking a Job number. 4 tabs:
1. **Shipment Details** — Overview, addresses, cargo, status/milestones
2. **Costs Breakdown** — Same cost section as invoicing
3. **Documents** — Attachments
4. **Tracking** — Tracking info

Header: 3 action buttons (maximize, popout, split with linked quote)

---

## Login System
- LoginScreen with email/password + eye toggle for password visibility
- AuthContext wrapping the app
- 4 users in appUsers table with roles (admin/user)

---

## DB Tables (14)
```
app_users, automation_log, shipment_edits, invoice_costs, invoice_additional_charges,
billing_settings, billing_overrides, generated_invoices, quotes, shipment_comments,
shipment_tasks, shipment_attachments, users (legacy)
```

---

## Recovery Backups
- `data.db.recovery` — After presentation clear
- `data.db.recovery-needed` — Before soft-delete implementation
- `data.db.recovery-needed-1` — Before Master Job feature
- `data.db.recovery-needed-2` — Before column layout restructure
- `data.db.recovery-needed-3` — Before Master Job document reading
- `data.db.recovery-needed-5` — Latest stable state (all features)

---

## Connected Services
- **Outlook** (CONNECTED) — send_email tool for automation notifications
- **GitHub** (CONNECTED) — github_mcp_direct

---

## Session Build History
1. Login system (LoginScreen, AuthContext, auth API)
2. Automation engine — 5 General + 9 IMP + 10 EXP rules
3. Eye icon on login password field
4. Fixed Shipment Detail Modal crash on missing data
5. 3 action buttons on shipment card (maximize, popout, split with linked quote)
6. Fixed Booked handler job number collisions
7. Dynamic Status dropdown based on Shipment type (IMP/EXP filtering)
8. "Created by" column (auto-filled CET datetime + email, non-editable, last position)
9. Renamed MWL→TRUCKING in Department dropdown
10. Redesigned ShipmentDetailModal with 4 tabs
11. Vision/OCR support for Document Reading (scanned PDFs + images)
12. Quote import field in Costs Breakdown tab
13. Replaced "Poolside Logistics" with "ABC, domcekova 16, Praha 5" in all PDFs
14. InvoiceChip popup (Download PDF / Show Costs)
15. Quote import accepts full invoice numbers, strips suffix
16. Service + Shipment type columns added to Quote tab
17. Quote Detail Card (QuoteDetailModal) with 4 tabs
18. Full QuoteCostSection embedded in Quote Detail Card Costs Breakdown tab
19. Double-click protection on all "Create Shipment" buttons
20. Soft-delete for shipments and quotes (data kept in DB, hidden from UI)
21. Master Job feature (MCZ numbers, Add to Master Job dialog, orange highlighting)
22. Add to existing Master Job option
23. MCZ numbers are permanent (always in existing list even if all shipments unlinked)
24. "Master job" column rename (from "Master number")
25. Master Job chat + attachments icons (amber-colored, keyed to MCZ number)
26. Frozen pane restructure: Job number → chat → attach → Master job → master chat → master attach (all locked)
27. Master Job document reading in Document/Text Reading tab (4th destination)
28. Batch processing for large PDFs (scanned: page-by-page vision; text: chunk-by-chunk)
29. Three document type recognition (Manifest, HBL, MBL) with MBL shared info enrichment
30. Confirmation dialog for removing shipment from Master Job
31. OPS notification Backup[Vacation] override
