import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, rawDb } from "./storage";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import Anthropic from "@anthropic-ai/sdk";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const EXTRACTABLE_FIELDS = [
  "Shipper",
  "Consignee",
  "Personal Reference",
  "Container Number",
  "Booking Number",
  "Load Type",
  "Shipping line / Coloader",
  "POL",
  "POD",
  "Destination",
  "HS Code",
  "Cargo Description",
  "House BoL Number",
  "Master BoL Number",
  "House BoL Type",
  "Master BoL Type",
  "Vessel",
  "Voyage",
  "CNTR count [1]",
  "CNTR length [1]",
  "CNTR type [1]",
  "CNTR count [2]",
  "CNTR length [2]",
  "CNTR type [2]",
  "CNTR length [3]",
  "CNTR type [3]",
  "CNTR count [4]",
  "CNTR length [4]",
  "CNTR type [4]",
  "PCS",
  "Total Weight In Tons",
  "Total Volume In CBM",
  "Cargo Origin",
  "Country code",
  "Origin",
  "Estimated Departure",
  "Estimated Arrival",
  "Trade Direction",
  "Agent",
  "Incoterm Origin",
  "Incoterm Destination",
  "Commercial Invoice Value",
];

const QUOTE_EXTRACTABLE_FIELDS = [
  "Shipper",
  "Consignee",
  "Load Type",
  "Agent",
  "Agent's PIC",
  "Incoterm Origin",
  "Incoterm Destination",
  "Cargo Origin",
  "Origin",
  "POL",
  "POD",
  "Destination",
  "HS Code",
  "Cargo Description",
  "Trade Direction",
  "Volume",
  "Weight",
  "Number of pieces",
  "CNTR count [1]",
  "CNTR length [1]",
  "CNTR count [2]",
  "CNTR length [2]",
  "CNTR count [3]",
  "CNTR length [3]",
  "CNTR count [4]",
  "CNTR length [4]",
  "PCS",
];

const QUOTE_SYSTEM_PROMPT = `You are a shipping document data extraction expert. You extract structured data from shipping documents (Rate Requests, Booking Inquiries, Quotation Requests, Bills of Lading, Sea Waybills, Booking Confirmations, Cargo Manifests, Packing Lists, Commercial Invoices, etc.).

Given the raw text content of a PDF document, extract ALL available fields from the following list. Return ONLY a JSON object with field names as keys and extracted values as strings. If a field is not found in the document, omit it entirely from the JSON.

Fields to extract:
${QUOTE_EXTRACTABLE_FIELDS.map(f => `- "${f}"`).join("\n")}

Rules:
1. For FCL/LCL, return exactly "FCL" or "LCL"
2. For Shipment type, use: "IMP" (import) or "EXP" (export)
3. For CNTR length, use standard sizes: "20", "40", "40HC", "45"
4. For CNTR count, return a number as string (e.g. "1", "2")
5. POL = Port of Loading, POD = Port of Discharge
6. Volume should be in CBM (cubic meters) as a number string
7. Weight should be in KGS as a number string
8. PCS = total number of pieces as a number string
9. Return pure JSON only — no markdown, no explanation, no wrapping.
10. Be precise — only extract what's explicitly stated in the document text.`;

const INVOICING_SYSTEM_PROMPT = `You are a shipping invoice and cost document extraction expert. You extract cost/billing data from invoices, debit notes, credit notes, proforma invoices, freight bills, customs declarations, and other cost-related shipping documents.

Given the raw text content of a PDF document, extract ALL available fields from the following list. Return ONLY a JSON object with field names as keys and extracted values as strings. If a field is not found in the document, omit it entirely from the JSON.

Fields to extract:
- "total_amount": The all-in / lumpsum / grand total amount (the final amount due/charged). If the document shows multiple line items, extract the total. Use the number only, no currency symbol (e.g. "1250.00").
- "currency": The currency of the total amount. Use standard 3-letter codes: CZK, USD, EUR, GBP, CHF, CNY, JPY, etc.
- "vendor": The vendor / supplier / service provider name (the entity issuing the invoice/bill, NOT the consignee or buyer).
- "invoice_number": The invoice number / reference number / document number.
- "invoice_date": The invoice date in DD/MM/YYYY format.
- "due_date": The payment due date in DD/MM/YYYY format.
- "description": A brief description of what the invoice covers (e.g. "Ocean freight Shanghai to Prague", "Customs clearance fees", "Local handling charges"). Maximum 80 characters.
- "service_type": Classify the service into one of these categories: "freight", "collection", "locals", "others", "insurance", "customs". Only return one of these exact values. If uncertain, use "others".

Rules:
1. For total_amount, extract the final/grand total, not subtotals or line items.
2. For vendor, extract the company issuing the document, NOT the recipient/buyer.
3. For currency, use standard ISO 4217 codes.
4. Return pure JSON only — no markdown, no explanation, no wrapping.
5. Be precise — only extract what's explicitly stated in the document text.`;

const SYSTEM_PROMPT = `You are a shipping document data extraction expert. You extract structured data from shipping documents (Bills of Lading, Sea Waybills, Booking Confirmations, Cargo Manifests, Packing Lists, Commercial Invoices, etc.).

Given the raw text content of a PDF shipping document, extract ALL available fields from the following list. Return ONLY a JSON object with field names as keys and extracted values as strings. If a field is not found in the document, omit it entirely from the JSON.

Fields to extract:
${EXTRACTABLE_FIELDS.map(f => `- "${f}"`).join("\n")}

Rules:
1. For dates (ETD date, ETA date), use MM/DD/YY format (e.g. 03/15/25)
2. For FCL/LCL, return exactly "FCL" or "LCL"
3. For H/BL type and M/BL type, use: "OBL", "SWB", "TLX" (Telex release), or "Express"
4. For Shipment type, use: "IMP" (import) or "EXP" (export)
5. For CNTR length, use standard sizes: "20", "40", "40HC", "45"
6. For CNTR type, use: "DRY", "REEFER", "OT" (Open Top), "FR" (Flat Rack), "TANK"
7. For CNTR count, return a number as string (e.g. "1", "2")
8. POL = Port of Loading, POD = Port of Discharge
9. Container numbers should be the actual container ID (e.g. "MSMU1234567")
10. Return pure JSON only — no markdown, no explanation, no wrapping.
11. Be precise — only extract what's explicitly stated in the document text.`;

const MASTER_JOB_SYSTEM_PROMPT = `You are a shipping document data extraction expert. You analyze Bills of Lading and cargo manifests to extract shipment data.

You will encounter THREE types of pages:

**TYPE 1: MANIFEST / CARGO LIST** — The BEST source for counting shipments. Lists multiple shipments in blocks. Each block has:
- A House B/L reference number (e.g. YSGSHALNZA1903121)
- S: (Shipper name)
- C: (Consignee name and address)
- N: (Notify party)
- Goods description, weight (KGS), volume (M3), packages, markings
Each block with a unique reference number = 1 separate shipment. Extract ALL blocks.

**TYPE 2: HOUSE BILL OF LADING (HBL)** — A full-page document for ONE shipment. Contains detailed shipper/consignee, vessel, POL/POD, container details, goods description. Each HBL page = 1 shipment.

**TYPE 3: MASTER BILL OF LADING (MBL)** — A consolidated document listing ALL cargo items shipped under one master booking. You can identify it by:
- Title says "BILL OF LADING" or "SEA WAYBILL" with a single booking number
- Lists many different goods with "N/M" marks (no shipper/consignee per line)
- Shows "** TO BE CONTINUED ON ATTACHED LIST **"
- Has container numbers at the top
IMPORTANT: The MBL is NOT individual shipments. It lists cargo summaries. Do NOT count MBL line items as separate shipments. Instead, extract ONLY the shared info (vessel, POL, POD, ETD, ETA, container numbers, shipping line, booking number, FCL/LCL) and return a single object with a special field "__type__": "MBL" so the system knows this is master info, not a shipment.

For each shipment (from manifest or HBL), extract:
${EXTRACTABLE_FIELDS.map(f => `- "${f}"`).join("\n")}

Always extract the House B/L number as "Personal Reference".

Return a JSON ARRAY of objects. Each object = one shipment (or one MBL info object with "__type__": "MBL").

Rules:
1. Manifest blocks with unique reference numbers = individual shipments.
2. HBL pages = individual shipments.
3. MBL pages = NOT shipments. Return 1 object with shared info + "__type__": "MBL".
4. For dates, use MM/DD/YY format.
5. FCL/LCL: return exactly "FCL" or "LCL".
6. Shipment type: "IMP" or "EXP".
7. CNTR length: "20", "40", "40HC", "45". CNTR type: "DRY", "REEFER", "OT", "FR", "TANK".
8. POL = Port of Loading, POD = Port of Discharge.
9. Include shared fields (vessel, POL, POD, ETD) in every shipment.
10. Return pure JSON array only.
11. If pages have no shipment data (terms, blank), return [].`;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ─── Shipment persistence endpoints ─────────────────────────────────

  // GET /api/shipment-edits — return all stored edits (frontend replays on top of base data)
  app.get("/api/shipment-edits", (_req, res) => {
    try {
      const edits = storage.getAllEdits();
      res.json(edits);
    } catch (err: any) {
      console.error("GET /api/shipment-edits error:", err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // POST /api/shipment-edits — record a new edit (create / update / delete)
  app.post("/api/shipment-edits", (req, res) => {
    try {
      const { action, jobKey, payload } = req.body;
      if (!action || !jobKey) {
        res.status(400).json({ error: "action and jobKey are required" });
        return;
      }
      if (!["create", "update", "delete"].includes(action)) {
        res.status(400).json({ error: "action must be create, update, or delete" });
        return;
      }
      const edit = storage.addEdit({
        action,
        jobKey,
        payload: JSON.stringify(payload || {}),
        createdAt: new Date().toISOString(),
      });
      res.json(edit);
    } catch (err: any) {
      console.error("POST /api/shipment-edits error:", err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // DELETE /api/shipment-edits/:jobKey — hard-delete a created shipment's entire edit history
  // (used when deleting a user-created shipment so edits don't pile up)
  app.delete("/api/shipment-edits/:jobKey", (req, res) => {
    try {
      storage.deleteEditsByJobKey(req.params.jobKey);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("DELETE /api/shipment-edits error:", err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // ─── Invoicing endpoints ────────────────────────────────────────────

  // GET /api/invoicing/:jobNumber — get all costs + additional charges for a job
  app.get("/api/invoicing/:jobNumber", (req, res) => {
    try {
      const { jobNumber } = req.params;
      const costs = storage.getInvoiceCosts(jobNumber);
      const additionalCharges = storage.getAdditionalCharges(jobNumber);
      res.json({ costs, additionalCharges });
    } catch (err: any) {
      console.error("GET /api/invoicing error:", err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // POST /api/invoicing/costs — upsert a cost row (create or update)
  app.post("/api/invoicing/costs", (req, res) => {
    try {
      const { jobNumber, category, estAmount, estCurrency, realAmount, realCurrency, invoiceNumber, vendor } = req.body;
      if (!jobNumber || !category) {
        res.status(400).json({ error: "jobNumber and category are required" });
        return;
      }
      const result = storage.upsertInvoiceCost({
        jobNumber,
        category,
        estAmount: estAmount || "",
        estCurrency: estCurrency || "CZK",
        realAmount: realAmount || "",
        realCurrency: realCurrency || "CZK",
        invoiceNumber: invoiceNumber || "",
        vendor: vendor || "",
      });
      res.json(result);
    } catch (err: any) {
      console.error("POST /api/invoicing/costs error:", err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // POST /api/invoicing/additional — add a new additional charge row
  app.post("/api/invoicing/additional", (req, res) => {
    try {
      const { jobNumber, invoiceNumber, vendor, description, estAmount, estCurrency, realAmount, realCurrency, sortOrder } = req.body;
      if (!jobNumber) {
        res.status(400).json({ error: "jobNumber is required" });
        return;
      }
      const result = storage.addAdditionalCharge({
        jobNumber,
        invoiceNumber: invoiceNumber || "",
        vendor: vendor || "",
        description: description || "",
        estAmount: estAmount || "",
        estCurrency: estCurrency || "CZK",
        realAmount: realAmount || "",
        realCurrency: realCurrency || "CZK",
        sortOrder: sortOrder ?? 0,
      });
      res.json(result);
    } catch (err: any) {
      console.error("POST /api/invoicing/additional error:", err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // PATCH /api/invoicing/additional/:id — update an additional charge row
  app.patch("/api/invoicing/additional/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const result = storage.updateAdditionalCharge(id, req.body);
      if (!result) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(result);
    } catch (err: any) {
      console.error("PATCH /api/invoicing/additional error:", err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // DELETE /api/invoicing/additional/:id — delete an additional charge row
  app.delete("/api/invoicing/additional/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      storage.deleteAdditionalCharge(id);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("DELETE /api/invoicing/additional error:", err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // ─── Billing endpoints ─────────────────────────────────────────────

  // GET /api/billing/quote-refs — returns every non-empty quoteRef currently in use,
  // so the client can pick the next free CZQ###-### sub-line for a given quote.
  // IMPORTANT: this route must be registered BEFORE the parametric /api/billing/:jobNumber,
  // otherwise Express will match "quote-refs" as a :jobNumber value.
  app.get("/api/billing/quote-refs", (_req, res) => {
    try {
      const all = storage.getAllBillingSettings();
      const refs = all
        .map((s) => s.quoteRef || "")
        .filter((r) => r && r.trim() !== "");
      res.json(refs);
    } catch (err: any) {
      console.error("GET /api/billing/quote-refs error:", err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // GET /api/billing/:jobNumber — get billing settings + overrides + generated invoices
  app.get("/api/billing/:jobNumber", (req, res) => {
    try {
      const { jobNumber } = req.params;
      const settings = storage.getBillingSettings(jobNumber);
      const overrides = storage.getBillingOverrides(jobNumber);
      const invoices = storage.getGeneratedInvoices(jobNumber);
      res.json({ settings: settings || null, overrides, invoices });
    } catch (err: any) {
      console.error("GET /api/billing error:", err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // POST /api/billing/settings — upsert billing currency + ROE + (optional) quoteRef for a job.
  // Only the fields actually present in the body are updated; missing fields stay intact.
  app.post("/api/billing/settings", (req, res) => {
    try {
      const { jobNumber, billingCurrency, roe, quoteRef } = req.body;
      if (!jobNumber) {
        res.status(400).json({ error: "jobNumber is required" });
        return;
      }
      const payload: any = { jobNumber };
      if (billingCurrency !== undefined) payload.billingCurrency = billingCurrency;
      if (roe !== undefined) payload.roe = roe;
      if (quoteRef !== undefined) payload.quoteRef = quoteRef;
      const result = storage.upsertBillingSettings(payload);
      res.json(result);
    } catch (err: any) {
      console.error("POST /api/billing/settings error:", err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // POST /api/billing/override — upsert a billing amount override for a row
  app.post("/api/billing/override", (req, res) => {
    try {
      const { jobNumber, rowKey, billingAmount } = req.body;
      if (!jobNumber || !rowKey) {
        res.status(400).json({ error: "jobNumber and rowKey are required" });
        return;
      }
      const result = storage.upsertBillingOverride(jobNumber, rowKey, billingAmount || "");
      res.json(result);
    } catch (err: any) {
      console.error("POST /api/billing/override error:", err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // POST /api/billing/generate-invoice — generate invoice number + store
  app.post("/api/billing/generate-invoice", (req, res) => {
    try {
      const { jobNumber, invoiceType, billingCurrency, totalAmount } = req.body;
      if (!jobNumber || !invoiceType) {
        res.status(400).json({ error: "jobNumber and invoiceType are required" });
        return;
      }
      const invoiceNumber = storage.getNextInvoiceNumber(jobNumber);
      const result = storage.createGeneratedInvoice({
        jobNumber,
        invoiceNumber,
        invoiceType,
        billingCurrency: billingCurrency || "CZK",
        totalAmount: totalAmount || "0",
        createdAt: new Date().toISOString(),
      });
      res.json(result);
    } catch (err: any) {
      console.error("POST /api/billing/generate-invoice error:", err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // ─── Auth endpoints ───────────────────────────────────────────────

  app.post("/api/auth/login", (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }
      const user = storage.getAppUserByEmail(email.toLowerCase().trim());
      if (!user || user.password !== password) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }
      res.json({ id: user.id, email: user.email, displayName: user.displayName, role: user.role });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // ─── Automation trigger endpoint ───────────────────────────────────

  // Helper: send email via external-tool CLI
  async function sendAutomationEmail(to: string, subject: string, body: string): Promise<boolean> {
    try {
      const { execSync } = await import("child_process");
      const params = JSON.stringify({
        source_id: "outlook",
        tool_name: "send_email",
        arguments: { action: { action: "send", to: [to], subject, body } },
      });
      execSync(`external-tool call '${params.replace(/'/g, "'\\''")}'`, { timeout: 15000 });
      return true;
    } catch (err: any) {
      console.error("Automation email failed:", err?.message);
      return false;
    }
  }

  // Helper: parse date string (MM/DD/YY or various formats) to Date
  function parseShipDate(val: string): Date | null {
    if (!val || val === "—") return null;
    // Try MM/DD/YY
    const mdy = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (mdy) {
      let yr = parseInt(mdy[3], 10);
      if (yr < 100) yr += 2000;
      return new Date(yr, parseInt(mdy[1], 10) - 1, parseInt(mdy[2], 10));
    }
    // Try ISO or other parseable format
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  // Helper: days between two dates (positive = future, negative = past)
  function daysDiff(target: Date, from: Date): number {
    const t = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
    const f = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
    return Math.round((t - f) / (24 * 60 * 60 * 1000));
  }

  app.post("/api/automation/trigger", async (req, res) => {
    try {
      const { jobNumber, column, oldValue, newValue, triggeredBy, shipmentData } = req.body;
      if (!jobNumber || !column) {
        res.status(400).json({ error: "jobNumber and column are required" });
        return;
      }

      const actions: string[] = [];
      const now = new Date();
      const sd = shipmentData || {};
      const tradeDir = (sd["Trade Direction"] || "").trim();
      const isIMP = tradeDir === "Import" || newValue?.includes?.("[IMP]");

      // ══ GENERAL RULES (all shipment types) ══════════════════════════

      // Department → AD → email ad@ourfuture.biz
      if (column === "Department" && newValue === "Administration Department" && oldValue !== "Administration Department") {
        const sent = await sendAutomationEmail(
          "ad@ourfuture.biz",
          `Shipment ${jobNumber} - Department changed to AD`,
          `You are in charge of ${jobNumber} shipment now.\n\nTriggered by: ${triggeredBy || "System"}\n\nAutomated notification from Shipment Tracker.`
        );
        actions.push(sent ? "dept_ad_email_sent" : "dept_ad_email_failed");
        storage.addAutomationLog({ jobNumber, ruleName: "dept_to_ad_alert", action: sent ? "email_sent" : "email_failed", details: JSON.stringify({ to: "ad@ourfuture.biz", column, newValue }), triggeredBy: triggeredBy || "", createdAt: now.toISOString() });
      }

      // Department → Customs → email customs@ourfuture.biz
      if (column === "Department" && newValue === "Custom Department" && oldValue !== "Custom Department") {
        const sent = await sendAutomationEmail(
          "customs@ourfuture.biz",
          `Alert - you got a new shipment to your department - ${jobNumber}`,
          `Shipment ${jobNumber} has been assigned to the Customs department.\n\nTriggered by: ${triggeredBy || "System"}\nAutomated notification from Shipment Tracker.`
        );
        actions.push(sent ? "dept_customs_email_sent" : "dept_customs_email_failed");
        storage.addAutomationLog({ jobNumber, ruleName: "dept_customs_alert", action: sent ? "email_sent" : "email_failed", details: JSON.stringify({ to: "customs@ourfuture.biz", column, newValue }), triggeredBy: triggeredBy || "", createdAt: now.toISOString() });
      }

      // Department → OPS → email to "Holiday Cover" if set, otherwise "Person In Charge"
      if (column === "Department" && newValue === "Operation Department" && oldValue !== "Operation Department") {
        const backupEmail = (sd["Holiday Cover"] || "").trim();
        const handlerEmail = (sd["Person In Charge"] || "").trim();
        const recipientEmail = backupEmail || handlerEmail;
        const recipientSource = backupEmail ? "Holiday Cover" : "Person In Charge";
        if (recipientEmail) {
          const sent = await sendAutomationEmail(
            recipientEmail,
            `Alert - you got a new shipment to your attention - ${jobNumber}`,
            `Shipment ${jobNumber} has been assigned to OPS department and is now in your care.\n\n${backupEmail ? `Note: This notification was redirected to you as the backup/vacation contact (original handler: ${handlerEmail || "not set"}).\n\n` : ""}Triggered by: ${triggeredBy || "System"}\nAutomated notification from Shipment Tracker.`
          );
          actions.push(sent ? "dept_ops_email_sent" : "dept_ops_email_failed");
          storage.addAutomationLog({ jobNumber, ruleName: "dept_ops_alert", action: sent ? "email_sent" : "email_failed", details: JSON.stringify({ to: recipientEmail, source: recipientSource, column, newValue }), triggeredBy: triggeredBy || "", createdAt: now.toISOString() });
        } else {
          actions.push("dept_ops_skipped: no handler or backup email");
        }
      }

      // Department → TRUCKING → email trucking@ourfuture.biz
      if (column === "Department" && newValue === "Road Department" && oldValue !== "Road Department") {
        const sent = await sendAutomationEmail(
          "trucking@ourfuture.biz",
          `Alert - you got a new message to your department - ${jobNumber}`,
          `Shipment ${jobNumber} has been assigned to the Trucking department.\n\nTriggered by: ${triggeredBy || "System"}\nAutomated notification from Shipment Tracker.`
        );
        actions.push(sent ? "dept_trucking_email_sent" : "dept_trucking_email_failed");
        storage.addAutomationLog({ jobNumber, ruleName: "dept_trucking_alert", action: sent ? "email_sent" : "email_failed", details: JSON.stringify({ to: "trucking@ourfuture.biz", column, newValue }), triggeredBy: triggeredBy || "", createdAt: now.toISOString() });
      }

      // Backup [Vacation] changes to any value → email to the address in that cell
      if (column === "Holiday Cover" && newValue && newValue.trim()) {
        const backupEmail = newValue.trim();
        const sent = await sendAutomationEmail(
          backupEmail,
          `Alert - you got a new shipment to your care - ${jobNumber}`,
          `Shipment ${jobNumber} has been assigned to you as backup/vacation cover.\n\nTriggered by: ${triggeredBy || "System"}\nAutomated notification from Shipment Tracker.`
        );
        actions.push(sent ? "backup_duty_email_sent" : "backup_duty_email_failed");
        storage.addAutomationLog({ jobNumber, ruleName: "backup_duty_alert", action: sent ? "email_sent" : "email_failed", details: JSON.stringify({ to: backupEmail, column, newValue }), triggeredBy: triggeredBy || "", createdAt: now.toISOString() });
      }

      // ── Status-based automation rules (IMP only) ──────────────────────
      if (column === "Shipment Status" && isIMP) {
        const statusUpper = (newValue || "").toUpperCase();
        const etaDepo = parseShipDate(sd["ETA Warehouse/HUB"] || "");
        const etaCnee = parseShipDate(sd["Planned Delivery Date"] || "");
        const etaDate = parseShipDate(sd["Estimated Arrival"] || "");
        const etdDate = parseShipDate(sd["Estimated Departure"] || "");

        const isOdplObjednano = statusUpper.includes("BOOKED FOR FURTHER TRANSPORT") || statusUpper.includes("BOOKED FOR FURTHER TRANSPORT");
        const isCekamVykladku = statusUpper.includes("DELIVERY DATE PENDING FROM CUSTOMER") || statusUpper.includes("DELIVERY DATE PENDING FROM CUSTOMER");
        const isCekamOdpluti = statusUpper.includes("ALL DONE - WAITING TO BE SHIPPED") || statusUpper.includes("ALL DONE - WAITING TO BE SHIPPED");
        const isOdplNeobj = statusUpper.includes("PRE-ALERT RECEIVED - FURTHER TRANSPORT TO BE BOOKED") || statusUpper.includes("PRE-ALERT RECEIVED - FURTHER TRANSPORT TO BE BOOKED");

        const matchedRules: { name: string; subject: string; body: string }[] = [];

        // Rule 2: Check arrival to rail depot
        // Trigger: Status → ODPLULO-OBJEDNÁNO or ČEKÁM NA VYKLÁDKU, ETA depo is a date
        if ((isOdplObjednano || isCekamVykladku) && etaDepo) {
          matchedRules.push({
            name: "check_arrival_rail_depot",
            subject: `Alert - Check the arrival to rail depot - ${jobNumber}`,
            body: `Shipment ${jobNumber}: Please check the arrival to the rail depot.\nETA depo: ${sd["ETA Warehouse/HUB"]}\nStatus: ${newValue}`,
          });
        }

        // Rule 3: Check delivery with the supplier
        // Trigger: Status → ODPLULO-OBJEDNÁNO or ČEKÁM NA VYKLÁDKU, ETA cnee is in the next 1 day
        if ((isOdplObjednano || isCekamVykladku) && etaCnee) {
          const diff = daysDiff(etaCnee, now);
          if (diff >= 0 && diff <= 1) {
            matchedRules.push({
              name: "check_delivery_supplier",
              subject: `Alert - Check the delivery with the supplier - ${jobNumber}`,
              body: `Shipment ${jobNumber}: ETA to consignee is within the next day.\nETA cnee: ${sd["Planned Delivery Date"]}\nPlease check delivery with the supplier.`,
            });
          }
        }

        // Rule 4: Check the departure
        // Trigger: Status → ODPLULO-OBJEDNÁNO or ČEKÁM NA VYKLÁDKU, ETA depo is in the next 2 days
        if ((isOdplObjednano || isCekamVykladku) && etaDepo) {
          const diff = daysDiff(etaDepo, now);
          if (diff >= 0 && diff <= 2) {
            matchedRules.push({
              name: "check_departure",
              subject: `Alert - Check the departure - ${jobNumber}`,
              body: `Shipment ${jobNumber}: ETA to depot is within the next 2 days.\nETA depo: ${sd["ETA Warehouse/HUB"]}\nPlease check the departure.`,
            });
          }
        }

        // Rule 5: Check whether delivered + bill the file
        // Trigger: Status → ODPLULO-OBJEDNÁNO or ČEKÁM NA VYKLÁDKU, ETA cnee is in the last 1 day
        if ((isOdplObjednano || isCekamVykladku) && etaCnee) {
          const diff = daysDiff(etaCnee, now);
          if (diff >= -1 && diff < 0) {
            matchedRules.push({
              name: "check_delivered_bill",
              subject: `Alert - Check whether delivered + bill the file - ${jobNumber}`,
              body: `Shipment ${jobNumber}: ETA to consignee was in the last day.\nETA cnee: ${sd["Planned Delivery Date"]}\nPlease check whether delivered and bill the file.`,
            });
          }
        }

        // Rule 6: Check with rail operator/haulier
        // Trigger: Status → ODPLULO-OBJEDNÁNO, ETA date is today
        if (isOdplObjednano && etaDate) {
          const diff = daysDiff(etaDate, now);
          if (diff === 0) {
            matchedRules.push({
              name: "check_rail_operator",
              subject: `Alert - Check with rail operator/haulier - ${jobNumber}`,
              body: `Shipment ${jobNumber}: ETA date is today.\nETA date: ${sd["Estimated Arrival"]}\nPlease check with the rail operator/haulier.`,
            });
          }
        }

        // Rule 7: Push for a delivery
        // Trigger: Status → ČEKÁM NA VYKLÁDKU or ODPLULO-OBJEDNÁNO, ETA depo is in the next 4 days
        if ((isCekamVykladku || isOdplObjednano) && etaDepo) {
          const diff = daysDiff(etaDepo, now);
          if (diff >= 0 && diff <= 4) {
            matchedRules.push({
              name: "push_for_delivery",
              subject: `Alert - Push for a delivery - ${jobNumber}`,
              body: `Shipment ${jobNumber}: ETA to depot is within the next 4 days.\nETA depo: ${sd["ETA Warehouse/HUB"]}\nPlease push for a delivery.`,
            });
          }
        }

        // Rule 8: Alert before sailing
        // Trigger: Status → ČEKÁM NA ODPLUTÍ, ETD date is in the next 2 days
        if (isCekamOdpluti && etdDate) {
          const diff = daysDiff(etdDate, now);
          if (diff >= 0 && diff <= 2) {
            matchedRules.push({
              name: "alert_before_sailing",
              subject: `Alert before sailing - ${jobNumber}`,
              body: `Shipment ${jobNumber}: ETD date is within the next 2 days.\nETD date: ${sd["Estimated Departure"]}\nPlease check whether all OK for sailing.`,
            });
          }
        }

        // Rule 9: Alert for Pre-Alert
        // Trigger: Status → ODPLULO-NEOBJEDNÁNO, ETD date is in the last 4 days
        if (isOdplNeobj && etdDate) {
          const diff = daysDiff(etdDate, now);
          if (diff >= -4 && diff <= 0) {
            matchedRules.push({
              name: "alert_pre_alert",
              subject: `Alert for Pre-Alert - ${jobNumber}`,
              body: `Shipment ${jobNumber}: ETD date was in the last 4 days.\nETD date: ${sd["Estimated Departure"]}\nPlease check with the agent the pre-alert.`,
            });
          }
        }

        // Rule 10: Alert import booking to providers
        // Trigger: Status → ODPLULO-NEOBJEDNÁNO, ETA date is in the next 14 days
        if (isOdplNeobj && etaDate) {
          const diff = daysDiff(etaDate, now);
          if (diff >= 0 && diff <= 14) {
            matchedRules.push({
              name: "alert_import_booking",
              subject: `Alert - Import booking to providers - ${jobNumber}`,
              body: `Shipment ${jobNumber}: ETA date is within the next 14 days.\nETA date: ${sd["Estimated Arrival"]}\nPlease import booking to providers.`,
            });
          }
        }

        // Send all matched rule emails to the handler assigned in "Person In Charge"
        const handlerEmail = (sd["Person In Charge"] || "").trim();
        if (handlerEmail && matchedRules.length > 0) {
          for (const rule of matchedRules) {
            const sent = await sendAutomationEmail(handlerEmail, rule.subject, `${rule.body}\n\nTriggered by: ${triggeredBy || "System"}\nAutomated notification from Shipment Tracker.`);
            actions.push(`${rule.name}: ${sent ? "email_sent" : "email_failed"}`);
            storage.addAutomationLog({ jobNumber, ruleName: rule.name, action: sent ? "email_sent" : "email_failed", details: JSON.stringify({ to: handlerEmail, status: newValue }), triggeredBy: triggeredBy || "", createdAt: now.toISOString() });
          }
        } else if (matchedRules.length > 0 && !handlerEmail) {
          actions.push("skipped: no handler email in 'Person In Charge'");
        }
      }

      // ══ EXP STATUS RULES (Shipment type = EXP) ═════════════════════
      const isEXP = tradeDir === "Export" || newValue?.includes?.("[EXP]");
      if (column === "Shipment Status" && isEXP) {
        const statusUpper = (newValue || "").toUpperCase();
        const closingDate = parseShipDate(sd["Closing Date"] || "");
        const puDate = parseShipDate(sd["Pickup Date"] || "");
        const etdDate = parseShipDate(sd["Estimated Departure"] || "");
        const crdDate = parseShipDate(sd["Cargo Readyness Date"] || "");
        const siDate = parseShipDate(sd["Shipping Instructions"] || "");
        const amsDate = parseShipDate(sd["AMS (if any)"] || "");
        const creationDate = parseShipDate(sd["Created by"] ? sd["Created by"].split("\u2014")[0].trim() : "");

        const isCekamNakladku = statusUpper.includes("PICK UP DATE PENDING FROM CUSTOMER") || statusUpper.includes("PICK UP DATE PENDING FROM CUSTOMER");
        const isCekamOdplutiExp = statusUpper.includes("ALL DONE - WAITING TO BE SHIPPED") || statusUpper.includes("ALL DONE - WAITING TO BE SHIPPED");
        const isChybiPlutiExp = statusUpper.includes("BOOKING CONFIRMATION PENDING") || statusUpper.includes("BOOKING CONFIRMATION PENDING");

        const expRules: { name: string; subject: string; body: string }[] = [];

        // EXP-1: Chase shipping line for BC
        // Trigger: CHYBÍ PLUTÍ [EXP], Date (creation) is in the last 2 days
        if (isChybiPlutiExp && creationDate) {
          const diff = daysDiff(creationDate, now);
          if (diff >= -2 && diff <= 0) {
            expRules.push({ name: "exp_chase_bc", subject: `Alert - Export - chase shipping line for BC - ${jobNumber}`, body: `Shipment ${jobNumber}: Please chase shipping line for the Booking Confirmation.` });
          }
        }

        // EXP-2: Check arrival to port with provider
        // Trigger: ČEKÁM NA NAKLÁDKU or ČEKÁM NA ODPLUTÍ [EXP], Closing date in next 2 days
        if ((isCekamNakladku || isCekamOdplutiExp) && closingDate) {
          const diff = daysDiff(closingDate, now);
          if (diff >= 0 && diff <= 2) {
            expRules.push({ name: "exp_check_arrival_port", subject: `Alert - Export - check the arrival to port with provider - ${jobNumber}`, body: `Shipment ${jobNumber}: Closing date is within the next 2 days.\nClosing date: ${sd["Closing Date"]}\nPlease check the arrival to port with provider.` });
          }
        }

        // EXP-3: Check with provider tomorrow's loading
        // Trigger: ČEKÁM NA NAKLÁDKU [EXP], PU date in next 1 day
        if (isCekamNakladku && puDate) {
          const diff = daysDiff(puDate, now);
          if (diff >= 0 && diff <= 1) {
            expRules.push({ name: "exp_check_tomorrows_loading", subject: `Alert - Export - check with provider tomorrow's loading - ${jobNumber}`, body: `Shipment ${jobNumber}: PU date is within the next day.\nPU date: ${sd["Pickup Date"]}\nPlease check with provider about tomorrow's loading.` });
          }
        }

        // EXP-4: File AMS
        // Trigger: ČEKÁM NA NAKLÁDKU or ČEKÁM NA ODPLUTÍ [EXP], AMS [USA only] in next 2 days
        if ((isCekamNakladku || isCekamOdplutiExp) && amsDate) {
          const diff = daysDiff(amsDate, now);
          if (diff >= 0 && diff <= 2) {
            expRules.push({ name: "exp_file_ams", subject: `Alert - Export - file AMS - ${jobNumber}`, body: `Shipment ${jobNumber}: AMS deadline is within the next 2 days.\nAMS date: ${sd["AMS (if any)"]}\nPlease file the AMS.` });
          }
        }

        // EXP-5: Fill out shipping instructions
        // Trigger: ČEKÁM NA NAKLÁDKU or ČEKÁM NA ODPLUTÍ [EXP], SI in next 2 days
        if ((isCekamNakladku || isCekamOdplutiExp) && siDate) {
          const diff = daysDiff(siDate, now);
          if (diff >= 0 && diff <= 2) {
            expRules.push({ name: "exp_fill_si", subject: `Alert - Export - fill out the shipping instructions - ${jobNumber}`, body: `Shipment ${jobNumber}: SI deadline is within the next 2 days.\nSI date: ${sd["Shipping Instructions"]}\nPlease fill out the shipping instructions.` });
          }
        }

        // EXP-6: Push for pre-alert
        // Trigger: ČEKÁM NA ODPLUTÍ or ČEKÁM NA NAKLÁDKU [EXP], ETD date in last 3 days
        if ((isCekamOdplutiExp || isCekamNakladku) && etdDate) {
          const diff = daysDiff(etdDate, now);
          if (diff >= -3 && diff <= 0) {
            expRules.push({ name: "exp_push_prealert", subject: `Alert - Export - push for pre-alert - ${jobNumber}`, body: `Shipment ${jobNumber}: ETD date was in the last 3 days.\nETD date: ${sd["Estimated Departure"]}\nPlease push for pre-alert.` });
          }
        }

        // EXP-7: Push for cargo ready date
        // Trigger: ČEKÁM NA NAKLÁDKU [EXP], CRD date is blank AND Date (creation) in last 1 day
        if (isCekamNakladku && !crdDate && creationDate) {
          const diff = daysDiff(creationDate, now);
          if (diff >= -1 && diff <= 0) {
            expRules.push({ name: "exp_push_cargo_ready", subject: `Alert - Export - push for the cargo readiness - ${jobNumber}`, body: `Shipment ${jobNumber}: CRD date is blank and the job was created recently.\nPlease push for the cargo ready date.` });
          }
        }

        // EXP-8: Push provider for pick up date
        // Trigger: ČEKÁM NA NAKLÁDKU [EXP], PU date is blank AND Closing date NOT in next 8 days
        if (isCekamNakladku && !puDate && closingDate) {
          const diff = daysDiff(closingDate, now);
          if (diff > 8 || diff < 0) {
            // Closing date is NOT in the next 8 days (either past or more than 8 days away)
            expRules.push({ name: "exp_push_pickup", subject: `Alert - Export - push provider for pick up date - ${jobNumber}`, body: `Shipment ${jobNumber}: PU date is blank and closing date is not within the next 8 days.\nClosing date: ${sd["Closing Date"]}\nPlease push provider for pick up date.` });
          }
        }

        // EXP-9: VGM filling
        // Trigger: ČEKÁM NA NAKLÁDKU or ČEKÁM NA ODPLUTÍ [EXP], SI in next 3 days
        if ((isCekamNakladku || isCekamOdplutiExp) && siDate) {
          const diff = daysDiff(siDate, now);
          if (diff >= 0 && diff <= 3) {
            expRules.push({ name: "exp_vgm_filling", subject: `Alert - Export - VGM filling - ${jobNumber}`, body: `Shipment ${jobNumber}: SI deadline is within the next 3 days.\nSI date: ${sd["Shipping Instructions"]}\nPlease fill in the VGM.` });
          }
        }

        // EXP-10: Zapp release
        // Trigger: ČEKÁM NA NAKLÁDKU or ČEKÁM NA ODPLUTÍ [EXP], Closing date in next 2 days
        if ((isCekamNakladku || isCekamOdplutiExp) && closingDate) {
          const diff = daysDiff(closingDate, now);
          if (diff >= 0 && diff <= 2) {
            expRules.push({ name: "exp_zapp_release", subject: `Alert - Export - zapp release - ${jobNumber}`, body: `Shipment ${jobNumber}: Closing date is within the next 2 days.\nClosing date: ${sd["Closing Date"]}\nPlease arrange the zapp release.` });
          }
        }

        // Send EXP rule emails to Job handled by
        const expHandlerEmail = (sd["Person In Charge"] || "").trim();
        if (expHandlerEmail && expRules.length > 0) {
          for (const rule of expRules) {
            const sent = await sendAutomationEmail(expHandlerEmail, rule.subject, `${rule.body}\n\nTriggered by: ${triggeredBy || "System"}\nAutomated notification from Shipment Tracker.`);
            actions.push(`${rule.name}: ${sent ? "email_sent" : "email_failed"}`);
            storage.addAutomationLog({ jobNumber, ruleName: rule.name, action: sent ? "email_sent" : "email_failed", details: JSON.stringify({ to: expHandlerEmail, status: newValue }), triggeredBy: triggeredBy || "", createdAt: now.toISOString() });
          }
        } else if (expRules.length > 0 && !expHandlerEmail) {
          actions.push("exp_skipped: no handler email in 'Person In Charge'");
        }
      }

      res.json({ triggered: actions.length > 0, actions });
    } catch (err: any) {
      console.error("Automation trigger error:", err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // ─── Tasks endpoints ───────────────────────────────────────────────

  app.get("/api/tasks/:jobNumber", (req, res) => {
    try {
      const tasks = storage.getTasks(req.params.jobNumber);
      res.json(tasks);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  app.post("/api/tasks", (req, res) => {
    try {
      const { jobNumber, taskKey, completed, completedBy } = req.body;
      if (!jobNumber || !taskKey) {
        res.status(400).json({ error: "jobNumber and taskKey are required" });
        return;
      }
      const result = storage.upsertTask(jobNumber, taskKey, completed ? 1 : 0, completedBy || "");
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // ─── Attachments endpoints ─────────────────────────────────────────

  app.get("/api/attachments/:jobNumber", (req, res) => {
    try {
      const attachments = storage.getAttachments(req.params.jobNumber);
      res.json(attachments);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  app.post("/api/attachments", (req, res) => {
    try {
      const { jobNumber, fileName, fileSize, fileType } = req.body;
      if (!jobNumber || !fileName) {
        res.status(400).json({ error: "jobNumber and fileName are required" });
        return;
      }
      const result = storage.addAttachment({
        jobNumber, fileName, fileSize: fileSize || 0, fileType: fileType || "",
        createdAt: new Date().toISOString(),
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  app.delete("/api/attachments/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
      storage.deleteAttachment(id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // ─── Comments endpoints ─────────────────────────────────────────────

  app.get("/api/comments/:jobNumber", (req, res) => {
    try {
      const comments = storage.getComments(req.params.jobNumber);
      res.json(comments);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  app.post("/api/comments", (req, res) => {
    try {
      const { jobNumber, author, message } = req.body;
      if (!jobNumber || !message) {
        res.status(400).json({ error: "jobNumber and message are required" });
        return;
      }
      const result = storage.addComment({
        jobNumber,
        author: author || "User",
        message,
        createdAt: new Date().toISOString(),
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  app.delete("/api/comments/:id", (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
      storage.deleteComment(id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // ─── Quotes endpoints ──────────────────────────────────────────────

  app.get("/api/quotes", (req, res) => {
    try {
      const allQuotes = storage.getAllQuotes();
      // If include_deleted param is set, return all (for number generation)
      if (req.query.include_deleted) {
        res.json(allQuotes);
        return;
      }
      // Otherwise filter out soft-deleted quotes
      const active = allQuotes.filter((q) => {
        try {
          const d = typeof q.data === "string" ? JSON.parse(q.data) : (q.data || {});
          return !d.__deleted__;
        } catch { return true; }
      });
      res.json(active);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  app.post("/api/quotes", (req, res) => {
    try {
      const { quoteNumber, data } = req.body;
      if (!quoteNumber) {
        res.status(400).json({ error: "quoteNumber is required" });
        return;
      }
      const result = storage.createQuote({
        quoteNumber,
        data: JSON.stringify(data || {}),
        createdAt: new Date().toISOString(),
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  app.patch("/api/quotes/:quoteNumber", (req, res) => {
    try {
      const { quoteNumber } = req.params;
      const { data } = req.body;
      const result = storage.updateQuote(quoteNumber, JSON.stringify(data || {}));
      if (!result) {
        res.status(404).json({ error: "Quote not found" });
        return;
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  app.delete("/api/quotes/:quoteNumber", (req, res) => {
    try {
      storage.deleteQuote(req.params.quoteNumber);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // ─── Quote Terms & Conditions ─────────────────────────────────────
  // Stored as a special __terms__ key inside the quote's data JSON blob

  app.get("/api/quotes/terms/:quoteNumber", (req, res) => {
    try {
      const quote = storage.getQuote(req.params.quoteNumber);
      if (!quote) return res.status(404).json({ error: "Quote not found" });
      const data = typeof quote.data === "string" ? JSON.parse(quote.data) : (quote.data || {});
      res.json({ terms: data.__terms__ || "" });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  app.post("/api/quotes/terms/:quoteNumber", (req, res) => {
    try {
      const quote = storage.getQuote(req.params.quoteNumber);
      if (!quote) return res.status(404).json({ error: "Quote not found" });
      const data = typeof quote.data === "string" ? JSON.parse(quote.data) : (quote.data || {});
      data.__terms__ = req.body.terms || "";
      storage.updateQuote(req.params.quoteNumber, JSON.stringify(data));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // ─── Helper: convert PDF to base64 image for vision API ────────────
  async function pdfToBase64Image(buffer: Buffer): Promise<string | null> {
    try {
      const { writeFileSync, readFileSync, unlinkSync } = await import("fs");
      const { execSync } = await import("child_process");
      const tmpPdf = `/tmp/extract_${Date.now()}.pdf`;
      const tmpImg = `/tmp/extract_${Date.now()}.png`;
      writeFileSync(tmpPdf, buffer);
      execSync(`pdftoppm -png -r 200 -singlefile "${tmpPdf}" "${tmpImg.replace('.png', '')}"`, { timeout: 15000 });
      const imgBuf = readFileSync(tmpImg);
      const base64 = imgBuf.toString("base64");
      try { unlinkSync(tmpPdf); } catch {}
      try { unlinkSync(tmpImg); } catch {}
      return base64;
    } catch (err: any) {
      console.error("PDF to image conversion failed:", err?.message);
      return null;
    }
  }

  // Helper: extract data from image using vision API
  async function extractFromImage(imageBase64: string, mediaType: string, systemPrompt: string, validFields: string[]): Promise<{ extracted: Record<string, string>; method: string }> {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude_sonnet_4_6",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType as any, data: imageBase64 },
            },
            {
              type: "text",
              text: "Extract all shipping data from this document image. Return ONLY a JSON object with the extracted fields.",
            },
          ],
        },
      ],
    });

    const responseText = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in vision response");
    const raw: Record<string, string> = JSON.parse(jsonMatch[0]);

    const extracted: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (validFields.includes(key) && typeof value === "string" && value.trim() !== "") {
        extracted[key] = value.trim();
      }
    }
    return { extracted, method: "vision" };
  }

  // ─── Document extraction endpoint ───────────────────────────────────

  app.post("/api/extract-document", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const mime = req.file.mimetype;
      const isImage = mime.startsWith("image/");
      const isPdf = mime === "application/pdf";

      if (!isPdf && !isImage) {
        res.status(400).json({ error: "Supported formats: PDF, JPEG, PNG" });
        return;
      }

      // If image file, go straight to vision
      if (isImage) {
        const base64 = req.file.buffer.toString("base64");
        const { extracted } = await extractFromImage(base64, mime, SYSTEM_PROMPT, EXTRACTABLE_FIELDS);
        res.json({ extracted, fieldCount: Object.keys(extracted).length, method: "vision", fileName: req.file.originalname });
        return;
      }

      // PDF: try text extraction first
      let pdfText = "";
      try {
        const parser = new PDFParse({ data: new Uint8Array(req.file.buffer) });
        const result = await parser.getText();
        pdfText = result.text || "";
      } catch { /* text extraction failed, will try vision */ }

      // If text extraction got meaningful content, use text-based extraction
      if (pdfText && pdfText.trim().length >= 20) {
        const client = new Anthropic();
        const message = await client.messages.create({
          model: "claude_sonnet_4_6",
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: `Extract shipping data from this document:\n\n---\n${pdfText.substring(0, 15000)}\n---\n\nReturn ONLY a JSON object with the extracted fields.` }],
        });

        const responseText = message.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) { res.status(500).json({ error: "Failed to parse extraction response" }); return; }
        const raw: Record<string, string> = JSON.parse(jsonMatch[0]);
        const validExtracted: Record<string, string> = {};
        for (const [key, value] of Object.entries(raw)) {
          if (EXTRACTABLE_FIELDS.includes(key) && typeof value === "string" && value.trim() !== "") validExtracted[key] = value.trim();
        }
        res.json({ extracted: validExtracted, fieldCount: Object.keys(validExtracted).length, method: "text", pdfTextLength: pdfText.length, fileName: req.file.originalname });
        return;
      }

      // Fallback: convert PDF to image and use vision API
      const imageBase64 = await pdfToBase64Image(req.file.buffer);
      if (!imageBase64) {
        res.status(400).json({ error: "Could not extract text or convert PDF to image. The file may be corrupted." });
        return;
      }

      const { extracted } = await extractFromImage(imageBase64, "image/png", SYSTEM_PROMPT, EXTRACTABLE_FIELDS);
      res.json({ extracted, fieldCount: Object.keys(extracted).length, method: "vision", fileName: req.file.originalname });
    } catch (err: any) {
      console.error("Extract document error:", err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // ─── Invoice document extraction endpoint ─────────────────────────

  const INVOICING_FIELDS = ["total_amount", "currency", "vendor", "invoice_number", "invoice_date", "due_date", "description", "service_type"];

  app.post("/api/extract-invoice", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
      const mime = req.file.mimetype;
      const isImage = mime.startsWith("image/");
      const isPdf = mime === "application/pdf";
      if (!isPdf && !isImage) { res.status(400).json({ error: "Supported formats: PDF, JPEG, PNG" }); return; }

      if (isImage) {
        const base64 = req.file.buffer.toString("base64");
        const { extracted } = await extractFromImage(base64, mime, INVOICING_SYSTEM_PROMPT, INVOICING_FIELDS);
        res.json({ extracted, fieldCount: Object.keys(extracted).length, method: "vision", fileName: req.file.originalname });
        return;
      }

      let pdfText = "";
      try { const parser = new PDFParse({ data: new Uint8Array(req.file.buffer) }); const result = await parser.getText(); pdfText = result.text || ""; } catch {}

      if (pdfText && pdfText.trim().length >= 20) {
        const client = new Anthropic();
        const message = await client.messages.create({ model: "claude_sonnet_4_6", max_tokens: 1024, system: INVOICING_SYSTEM_PROMPT, messages: [{ role: "user", content: `Extract invoice/cost data from this document:\n\n---\n${pdfText.substring(0, 15000)}\n---\n\nReturn ONLY a JSON object with the extracted fields.` }] });
        const responseText = message.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) { res.status(500).json({ error: "Failed to parse extraction response" }); return; }
        const raw: Record<string, string> = JSON.parse(jsonMatch[0]);
        const validExtracted: Record<string, string> = {};
        for (const [key, value] of Object.entries(raw)) { if (INVOICING_FIELDS.includes(key) && typeof value === "string" && value.trim() !== "") validExtracted[key] = value.trim(); }
        res.json({ extracted: validExtracted, fieldCount: Object.keys(validExtracted).length, method: "text", fileName: req.file.originalname });
        return;
      }

      const imageBase64 = await pdfToBase64Image(req.file.buffer);
      if (!imageBase64) { res.status(400).json({ error: "Could not process this file." }); return; }
      const { extracted } = await extractFromImage(imageBase64, "image/png", INVOICING_SYSTEM_PROMPT, INVOICING_FIELDS);
      res.json({ extracted, fieldCount: Object.keys(extracted).length, method: "vision", fileName: req.file.originalname });
    } catch (err: any) {
      console.error("Extract invoice error:", err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // ─── Text extraction endpoint (all destinations) ────────────────

  app.post("/api/extract-text", async (req, res) => {
    try {
      const { text, destination } = req.body;
      if (!text || typeof text !== "string" || text.trim().length < 10) {
        res.status(400).json({ error: "Text must be at least 10 characters." });
        return;
      }
      if (text.length > 1500) {
        res.status(400).json({ error: "Text exceeds the 1,500 character limit." });
        return;
      }

      // Pick prompt + field list based on destination
      let systemPrompt: string;
      let validFields: string[];
      if (destination === "invoicing") {
        systemPrompt = INVOICING_SYSTEM_PROMPT;
        validFields = ["total_amount", "currency", "vendor", "invoice_number", "invoice_date", "due_date", "description", "service_type"];
      } else if (destination === "quote") {
        systemPrompt = QUOTE_SYSTEM_PROMPT;
        validFields = QUOTE_EXTRACTABLE_FIELDS;
      } else {
        systemPrompt = SYSTEM_PROMPT;
        validFields = EXTRACTABLE_FIELDS;
      }

      const client = new Anthropic();
      const message = await client.messages.create({
        model: "claude_sonnet_4_6",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Extract data from this text:\n\n---\n${text}\n---\n\nReturn ONLY a JSON object with the extracted fields.`,
          },
        ],
      });

      const responseText = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      let extracted: Record<string, string>;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON object found in response");
        extracted = JSON.parse(jsonMatch[0]);
      } catch (parseErr: any) {
        res.status(500).json({ error: "Failed to parse LLM extraction response", raw: responseText });
        return;
      }

      const validExtracted: Record<string, string> = {};
      for (const [key, value] of Object.entries(extracted)) {
        if (validFields.includes(key) && typeof value === "string" && value.trim() !== "") {
          validExtracted[key] = value.trim();
        }
      }

      res.json({
        extracted: validExtracted,
        fieldCount: Object.keys(validExtracted).length,
        fileName: "(text input)",
      });
    } catch (err: any) {
      console.error("Extract text error:", err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // ─── Quote document extraction endpoint ────────────────────────────

  app.post("/api/extract-quote", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
      const mime = req.file.mimetype;
      const isImage = mime.startsWith("image/");
      const isPdf = mime === "application/pdf";
      if (!isPdf && !isImage) { res.status(400).json({ error: "Supported formats: PDF, JPEG, PNG" }); return; }

      if (isImage) {
        const base64 = req.file.buffer.toString("base64");
        const { extracted } = await extractFromImage(base64, mime, QUOTE_SYSTEM_PROMPT, QUOTE_EXTRACTABLE_FIELDS);
        res.json({ extracted, fieldCount: Object.keys(extracted).length, method: "vision", fileName: req.file.originalname });
        return;
      }

      let pdfText = "";
      try { const parser = new PDFParse({ data: new Uint8Array(req.file.buffer) }); const result = await parser.getText(); pdfText = result.text || ""; } catch {}

      if (pdfText && pdfText.trim().length >= 20) {
        const client = new Anthropic();
        const message = await client.messages.create({ model: "claude_sonnet_4_6", max_tokens: 2048, system: QUOTE_SYSTEM_PROMPT, messages: [{ role: "user", content: `Extract shipping/quote data from this document:\n\n---\n${pdfText.substring(0, 15000)}\n---\n\nReturn ONLY a JSON object with the extracted fields.` }] });
        const responseText = message.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) { res.status(500).json({ error: "Failed to parse extraction response" }); return; }
        const raw: Record<string, string> = JSON.parse(jsonMatch[0]);
        const validExtracted: Record<string, string> = {};
        for (const [key, value] of Object.entries(raw)) { if (QUOTE_EXTRACTABLE_FIELDS.includes(key) && typeof value === "string" && value.trim() !== "") validExtracted[key] = value.trim(); }
        res.json({ extracted: validExtracted, fieldCount: Object.keys(validExtracted).length, method: "text", fileName: req.file.originalname });
        return;
      }

      const imageBase64 = await pdfToBase64Image(req.file.buffer);
      if (!imageBase64) { res.status(400).json({ error: "Could not process this file." }); return; }
      const { extracted } = await extractFromImage(imageBase64, "image/png", QUOTE_SYSTEM_PROMPT, QUOTE_EXTRACTABLE_FIELDS);
      res.json({ extracted, fieldCount: Object.keys(extracted).length, method: "vision", fileName: req.file.originalname });
    } catch (err: any) {
      console.error("Extract quote error:", err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ─── MASTER JOB 3-PHASE PIPELINE ──────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════
  //
  // Phase 1: Upload + classify pages (MANIFEST / HBL / MBL / SKIP)
  // Phase 2: Extract shipments from manifest + MBL shared info
  // Phase 3: On-demand HBL enrichment per shipment
  //

  interface PipelineSession {
    pages: { pageNum: number; type: string; base64: string }[];
    mblInfo: Record<string, string> | null;
    shipments: Record<string, string>[];
    fileName: string;
  }
  const pipelineSessions = new Map<string, PipelineSession>();

  // Helper: parse JSON array from AI response
  const parsePipelineArray = (text: string): any[] => {
    try {
      const arrMatch = text.match(/\[[\s\S]*\]/);
      if (arrMatch) { const arr = JSON.parse(arrMatch[0]); if (Array.isArray(arr)) return arr; }
      const objMatch = text.match(/\{[\s\S]*\}/);
      if (objMatch) return [JSON.parse(objMatch[0])];
    } catch (e) { console.error("Pipeline JSON parse error:", e); }
    return [];
  };

  const filterExtractable = (raw: Record<string, any>): Record<string, string> => {
    const valid: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if ((EXTRACTABLE_FIELDS.includes(k) || k === "__type__" || k === "Personal Reference") && typeof v === "string" && v.trim()) valid[k] = v.trim();
    }
    return valid;
  };

  // ─── PHASE 1: Upload PDF, convert pages, classify ─────────────────────

  app.post("/api/pipeline/prepare", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
      const mime = req.file.mimetype;
      const isImage = mime.startsWith("image/");
      const isPdf = mime === "application/pdf";
      if (!isPdf && !isImage) { res.status(400).json({ error: "Supported: PDF, JPEG, PNG" }); return; }

      const sessionId = `pipe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      if (isImage) {
        // Single image = 1 page, assume HBL
        const b64 = req.file.buffer.toString("base64");
        pipelineSessions.set(sessionId, {
          pages: [{ pageNum: 1, type: "HBL", base64: b64 }],
          mblInfo: null, shipments: [], fileName: req.file.originalname,
        });
        res.json({ sessionId, pageCount: 1, classification: { MANIFEST: 0, HBL: 1, MBL: 0, SKIP: 0 }, pages: [{ pageNum: 1, type: "HBL" }] });
        return;
      }

      // PDF: check for text
      let pdfText = "";
      try { const parser = new PDFParse({ data: new Uint8Array(req.file.buffer) }); const result = await parser.getText(); pdfText = result.text || ""; } catch {}

      const isScanned = !pdfText || pdfText.trim().length < 100;

      // Get page count
      const { writeFileSync, readFileSync, unlinkSync } = await import("fs");
      const { execSync } = await import("child_process");
      const tmpPdf = `/tmp/pipe_${Date.now()}.pdf`;
      writeFileSync(tmpPdf, req.file.buffer);

      let pageCount = 1;
      try {
        const info = execSync(`pdfinfo ${tmpPdf} 2>/dev/null | grep Pages`).toString();
        const m = info.match(/(\d+)/);
        if (m) pageCount = parseInt(m[1], 10);
      } catch {}
      console.log(`Pipeline: ${pageCount} pages, scanned=${isScanned}, textLen=${pdfText.length}`);

      // Convert pages to images
      // Low-res (72 DPI) for classification, high-res (150 DPI) stored for later extraction
      const prefix72 = `/tmp/pipe72_${Date.now()}`;
      const prefix150 = `/tmp/pipe150_${Date.now()}`;
      try { execSync(`pdftoppm -png -r 72 ${tmpPdf} ${prefix72}`, { timeout: 120000 }); } catch (e: any) { console.error("pdftoppm 72 error:", e?.message); }
      try { execSync(`pdftoppm -png -r 150 ${tmpPdf} ${prefix150}`, { timeout: 180000 }); } catch (e: any) { console.error("pdftoppm 150 error:", e?.message); }
      try { unlinkSync(tmpPdf); } catch {}

      // Collect page images
      const pages: { pageNum: number; type: string; base64: string; thumb64: string }[] = [];
      const padLen = String(pageCount).length;
      for (let p = 1; p <= pageCount; p++) {
        const padded = String(p).padStart(padLen, "0");
        let hi = "", lo = "";
        try { hi = readFileSync(`${prefix150}-${padded}.png`).toString("base64"); unlinkSync(`${prefix150}-${padded}.png`); } catch {}
        try { lo = readFileSync(`${prefix72}-${padded}.png`).toString("base64"); unlinkSync(`${prefix72}-${padded}.png`); } catch {}
        if (hi || lo) {
          pages.push({ pageNum: p, type: "UNKNOWN", base64: hi || lo, thumb64: lo || hi });
        }
      }
      console.log(`Pipeline: converted ${pages.length} pages to images`);

      // Classify pages in batches of 10 thumbnails
      const CLASSIFY_BATCH = 10;
      const classifyPrompt = `Classify each page image. Return a JSON array with one object per image, in order:
[{"page": 1, "type": "MANIFEST"}, {"page": 2, "type": "HBL"}, ...]

Types:
- MANIFEST: Cargo manifest/list showing multiple shipments in blocks (has S: Shipper, C: Consignee per block, reference numbers like YSGSHALNZA...)
- HBL: House Bill of Lading (full-page BL for one shipment, has shipper/consignee/vessel/POL/POD)
- MBL: Master Bill of Lading (single consolidated BL with many cargo items marked N/M, container list, "TO BE CONTINUED")
- SKIP: Terms & conditions, blank pages, signatures, cover pages, anything without shipment data

Return ONLY the JSON array.`;

      for (let i = 0; i < pages.length; i += CLASSIFY_BATCH) {
        const batch = pages.slice(i, i + CLASSIFY_BATCH);
        const contentBlocks: any[] = batch.map((pg) => ({
          type: "image", source: { type: "base64", media_type: "image/png", data: pg.thumb64 },
        }));
        contentBlocks.push({ type: "text", text: `${classifyPrompt}\n\nThese are pages ${i + 1} to ${i + batch.length} of ${pages.length}.` });

        try {
          const client = new Anthropic();
          const msg = await client.messages.create({
            model: "claude_sonnet_4_6", max_tokens: 2048,
            messages: [{ role: "user", content: contentBlocks }],
          });
          const rt = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
          const classifications = parsePipelineArray(rt);
          for (const cls of classifications) {
            const pageIdx = (cls.page || cls.pageNum || (i + classifications.indexOf(cls) + 1)) - 1;
            if (pageIdx >= 0 && pageIdx < pages.length && cls.type) {
              pages[pageIdx].type = cls.type.toUpperCase();
            }
          }
          console.log(`Classified pages ${i + 1}-${i + batch.length}:`, batch.map((_, j) => pages[i + j].type).join(", "));
        } catch (err: any) {
          console.error(`Classification batch ${i + 1} failed:`, err?.message);
          // Mark as SKIP if classification fails
          batch.forEach((_, j) => { if (pages[i + j].type === "UNKNOWN") pages[i + j].type = "SKIP"; });
        }
      }

      // Mark any remaining UNKNOWN as SKIP
      pages.forEach(p => { if (p.type === "UNKNOWN") p.type = "SKIP"; });

      // Store session (without thumbnails to save memory)
      const sessionPages = pages.map(p => ({ pageNum: p.pageNum, type: p.type, base64: p.base64 }));
      pipelineSessions.set(sessionId, {
        pages: sessionPages, mblInfo: null, shipments: [], fileName: req.file.originalname,
      });

      // Build classification summary
      const counts = { MANIFEST: 0, HBL: 0, MBL: 0, SKIP: 0 };
      for (const p of pages) { counts[p.type as keyof typeof counts] = (counts[p.type as keyof typeof counts] || 0) + 1; }

      console.log(`Pipeline classification: MANIFEST=${counts.MANIFEST}, HBL=${counts.HBL}, MBL=${counts.MBL}, SKIP=${counts.SKIP}`);
      res.json({
        sessionId, pageCount: pages.length, classification: counts,
        pages: pages.map(p => ({ pageNum: p.pageNum, type: p.type })),
        fileName: req.file.originalname,
      });
    } catch (err: any) {
      console.error("Pipeline prepare error:", err?.message || err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // ─── PHASE 2a: Extract MBL shared info (single quick call) ───────────

  app.post("/api/pipeline/extract-mbl", async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) { res.status(400).json({ error: "sessionId required" }); return; }
      const session = pipelineSessions.get(sessionId);
      if (!session) { res.status(404).json({ error: "Session expired. Re-upload." }); return; }

      const mblPages = session.pages.filter(p => p.type === "MBL");
      if (mblPages.length === 0) {
        res.json({ mblInfo: null, message: "No MBL pages found" });
        return;
      }

      console.log(`Phase 2a: extracting shared info from ${mblPages.length} MBL pages`);
      const mblBlocks: any[] = mblPages.slice(0, 3).map(p => ({
        type: "image", source: { type: "base64", media_type: "image/png", data: p.base64 },
      }));
      mblBlocks.push({ type: "text", text: `This is a Master Bill of Lading (MBL). Extract ONLY the shared shipping info:\n- Vessel / Voyage\n- POL, POD\n- ETD date, ETA date\n- Shipping line / Coloader\n- Booking number\n- FCL/LCL\n- CNTR no. (all container numbers)\n- CNTR count, length, type\n\nReturn a single JSON object. Do NOT extract cargo items.` });

      const client = new Anthropic();
      const msg = await client.messages.create({
        model: "claude_sonnet_4_6", max_tokens: 2048,
        messages: [{ role: "user", content: mblBlocks }],
      });
      const rt = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      const parsed = parsePipelineArray(rt);
      const mblInfo = parsed.length > 0 ? filterExtractable(parsed[0]) : null;

      session.mblInfo = mblInfo;
      console.log(`MBL info:`, mblInfo ? Object.keys(mblInfo).length + " fields" : "none");
      res.json({ mblInfo });
    } catch (err: any) {
      console.error("Pipeline extract-mbl error:", err?.message || err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // ─── PHASE 2b: Extract HBL batch (3 pages at a time) ────────────────

  app.post("/api/pipeline/extract-hbl-batch", async (req, res) => {
    try {
      const { sessionId, batchIndex } = req.body;
      if (!sessionId || batchIndex === undefined) { res.status(400).json({ error: "sessionId and batchIndex required" }); return; }
      const session = pipelineSessions.get(sessionId);
      if (!session) { res.status(404).json({ error: "Session expired. Re-upload." }); return; }

      const hblPages = session.pages.filter(p => p.type === "HBL");
      const BATCH_SIZE = 3;
      const startIdx = batchIndex * BATCH_SIZE;
      const batch = hblPages.slice(startIdx, startIdx + BATCH_SIZE);
      const totalBatches = Math.ceil(hblPages.length / BATCH_SIZE);

      if (batch.length === 0) {
        res.json({ shipments: [], batchIndex, totalBatches, done: true });
        return;
      }

      console.log(`Phase 2b: HBL batch ${batchIndex + 1}/${totalBatches} (pages ${batch.map(p => p.pageNum).join(", ")})`);

      const contentBlocks: any[] = batch.map(p => ({
        type: "image", source: { type: "base64", media_type: "image/png", data: p.base64 },
      }));
      contentBlocks.push({ type: "text", text: `These are ${batch.length} House Bill of Lading pages. Each page = 1 shipment.

For EACH page, extract a separate shipment object with these fields:
${EXTRACTABLE_FIELDS.join(", ")}, and "Personal Reference" (the House B/L number).

Return a JSON array with exactly ${batch.length} objects (one per page). Include all available details from each BL.` });

      const client = new Anthropic();
      const msg = await client.messages.create({
        model: "claude_sonnet_4_6", max_tokens: 8192, system: MASTER_JOB_SYSTEM_PROMPT,
        messages: [{ role: "user", content: contentBlocks }],
      });
      const rt = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      let shipments = parsePipelineArray(rt).map(filterExtractable).filter(s => Object.keys(s).length > 1);

      // Enrich with MBL shared info
      if (session.mblInfo) {
        const sharedKeys = ["POL", "POD", "Vessel / Voyage", "Estimated Departure", "Estimated Arrival", "Shipping line / Coloader", "Booking Number", "Load Type"];
        for (const ship of shipments) {
          for (const key of sharedKeys) {
            if (!ship[key] && session.mblInfo[key]) ship[key] = session.mblInfo[key];
          }
        }
      }

      // Add to session
      session.shipments.push(...shipments);

      const done = (batchIndex + 1) >= totalBatches;
      console.log(`HBL batch ${batchIndex + 1}: ${shipments.length} shipments extracted. Total so far: ${session.shipments.length}. Done: ${done}`);

      res.json({
        shipments,
        batchIndex,
        totalBatches,
        totalExtracted: session.shipments.length,
        done,
      });
    } catch (err: any) {
      console.error("Pipeline extract-hbl-batch error:", err?.message || err);
      res.status(500).json({ error: err?.message || "Internal server error" });
    }
  });

  // ─── FALLBACK: Keep old endpoint for backward compat (redirects to pipeline) ───

  app.post("/api/master-job-prepare", upload.single("file"), async (req, res) => {
    res.status(410).json({ error: "Deprecated. Use /api/pipeline/prepare instead." });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ─── WAREHOUSE CRM ─────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════

  // Initialize warehouse tables (raw SQL, no Drizzle)
  const whDb = rawDb; // raw better-sqlite3 handle for direct SQL
  whDb.exec(`CREATE TABLE IF NOT EXISTS wh_tasks (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'Import',
    priority TEXT NOT NULL DEFAULT 'Medium',
    status TEXT NOT NULL DEFAULT 'Pending',
    assignee TEXT NOT NULL DEFAULT '',
    due_date TEXT NOT NULL DEFAULT '',
    cargo TEXT NOT NULL DEFAULT '',
    weight TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`);
  whDb.exec(`CREATE TABLE IF NOT EXISTS wh_task_json_data (
    task_id TEXT NOT NULL,
    section TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (task_id, section)
  )`);
  whDb.exec(`CREATE TABLE IF NOT EXISTS wh_job_counter (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    next_num INTEGER NOT NULL DEFAULT 1
  )`);
  whDb.exec(`CREATE TABLE IF NOT EXISTS wh_deleted_ids (
    job_id TEXT PRIMARY KEY
  )`);
  whDb.exec(`INSERT OR IGNORE INTO wh_job_counter (id, next_num) VALUES (1, 1)`);

  // Sync counter to be above max existing task
  const maxTask = whDb.prepare(`SELECT id FROM wh_tasks ORDER BY created_at DESC LIMIT 1`).get() as any;
  if (maxTask) {
    const numMatch = maxTask.id.match(/(\d+)$/);
    if (numMatch) {
      const maxNum = parseInt(numMatch[1], 10);
      whDb.prepare(`UPDATE wh_job_counter SET next_num = MAX(next_num, ?)`).run(maxNum + 1);
    }
  }

  // Seed data disabled for production
  const taskCount = (whDb.prepare(`SELECT COUNT(*) as c FROM wh_tasks`).get() as any)?.c || 0;
  if (false && taskCount === 0) {
    const seeds = [
      ["WHCZ2026001", "Import", "High", "In Progress", "Martin K.", "05.04.2026", "Electronics", "1,240 kg"],
      ["WHCZ2026002", "Export", "Medium", "Pending", "Jana P.", "06.04.2026", "Textiles", "850 kg"],
      ["WHCZ2026003", "Import", "Low", "Completed", "Petr S.", "04.04.2026", "Machinery", "2,100 kg"],
      ["WHCZ2026004", "Customs", "High", "In Progress", "Eva M.", "05.04.2026", "Medical Supplies", "450 kg"],
      ["WHCZ2026005", "Import", "Medium", "In Progress", "Tom\u00e1\u0161 V.", "07.04.2026", "Auto Parts", "1,680 kg"],
      ["WHCZ2026006", "Export", "High", "Pending", "Lucie B.", "05.04.2026", "Food Products", "920 kg"],
      ["WHCZ2026007", "Customs", "Low", "Completed", "David R.", "03.04.2026", "Books", "340 kg"],
      ["WHCZ2026008", "Import", "Medium", "In Progress", "Michaela H.", "06.04.2026", "Furniture", "1,550 kg"],
      ["WHCZ2026009", "Export", "High", "Pending", "Jan N.", "05.04.2026", "Chemicals", "780 kg"],
      ["WHCZ2026010", "Customs", "Medium", "Completed", "Kl\u00e1ra T.", "04.04.2026", "Clothing", "620 kg"],
    ];
    const ins = whDb.prepare(`INSERT INTO wh_tasks (id, type, priority, status, assignee, due_date, cargo, weight, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const s of seeds) ins.run(s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], Date.now() - Math.random() * 86400000);
    whDb.exec(`UPDATE wh_job_counter SET next_num = 11`);
  }

  // ─── Warehouse API routes ───

  app.get("/api/wh/tasks", (_req, res) => {
    try {
      const tasks = whDb.prepare(`SELECT * FROM wh_tasks ORDER BY CAST(SUBSTR(id, 9) AS INTEGER) DESC`).all();
      res.json(tasks);
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  app.post("/api/wh/tasks", (_req, res) => {
    try {
      const row = whDb.prepare(`SELECT next_num FROM wh_job_counter WHERE id = 1`).get() as any;
      const num = row?.next_num || 1;
      const id = `WHCZ2026${String(num).padStart(3, "0")}`;
      whDb.exec(`UPDATE wh_job_counter SET next_num = next_num + 1 WHERE id = 1`);
      whDb.prepare(`INSERT INTO wh_tasks (id, type, priority, status, assignee, due_date, cargo, weight, created_at) VALUES (?, 'Import', 'Medium', 'Pending', '', '', '', '', ?)`).run(id, Date.now());
      res.json({ id });
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  app.delete("/api/wh/tasks/:id", (req, res) => {
    try {
      const { id } = req.params;
      whDb.prepare(`INSERT OR IGNORE INTO wh_deleted_ids (job_id) VALUES (?)`).run(id);
      whDb.prepare(`DELETE FROM wh_task_json_data WHERE task_id = ?`).run(id);
      whDb.prepare(`DELETE FROM wh_tasks WHERE id = ?`).run(id);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  app.get("/api/wh/tasks/:id/section/:section", (req, res) => {
    try {
      const { id, section } = req.params;
      const row = whDb.prepare(`SELECT data FROM wh_task_json_data WHERE task_id = ? AND section = ?`).get(id, section) as any;
      res.json(row ? JSON.parse(row.data) : {});
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  app.put("/api/wh/tasks/:id/section/:section", (req, res) => {
    try {
      const { id, section } = req.params;
      const data = JSON.stringify(req.body);
      whDb.prepare(`INSERT INTO wh_task_json_data (task_id, section, data) VALUES (?, ?, ?) ON CONFLICT(task_id, section) DO UPDATE SET data = ?`).run(id, section, data, data);
      // Also update main task fields if saving job section
      if (section === "job" && req.body) {
        const b = req.body;
        if (b.weight !== undefined) whDb.prepare(`UPDATE wh_tasks SET weight = ? WHERE id = ?`).run(b.weight || "", id);
        if (b.cargo !== undefined) whDb.prepare(`UPDATE wh_tasks SET cargo = ? WHERE id = ?`).run(b.cargo || "", id);
      }
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err?.message }); }
  });

  return httpServer;
}
