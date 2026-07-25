import type { Express } from "express";
import type { Server } from "http";
import { createServer } from "http";
import { storage, sqlite } from "./storage";
import { z } from "zod";
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import { fetchLogo, deleteLogo, getLogoDir } from "./logoService";
import expressStatic from "express";
import multer from "multer";

const docsDir = path.join(process.cwd(), "public", "documents");
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
const docUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, docsDir),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}_${safe}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Serve uploaded logos and documents
  app.use("/logos", expressStatic.static(getLogoDir()));
  app.use("/documents", expressStatic.static(docsDir));
  // Serve other public assets (ship photo, favicon) in both dev and prod
  app.use(expressStatic.static(path.join(process.cwd(), "public")));

  // File upload for documents
  app.post("/api/customers/:id/documents/upload", docUpload.single("file"), (req: any, res) => {
    if (!req.file) return res.status(400).json({ error: "No file" });
    const fileUrl = `/documents/${req.file.filename}`;
    const name = (req.body.name || req.file.originalname).trim();
    const type = req.body.type || "Other";
    const d = storage.createDocument({ name, type, url: fileUrl, customerId: parseInt(req.params.id), uploadedAt: Date.now() });
    res.json(d);
  });

  // ── Sales Quotes (permanent references, never reusable) ───────────────────
  app.get("/api/sales-quotes", (_req, res) => {
    const rows = sqlite.prepare("SELECT * FROM sales_quotes ORDER BY created_at DESC").all();
    res.json(rows);
  });

  app.get("/api/sales-quotes/next-ref", (_req, res) => {
    const now  = new Date();
    const yyyy = now.getFullYear();
    const mm   = String(now.getMonth() + 1).padStart(2, "0");
    const dd   = String(now.getDate()).padStart(2, "0");
    const dateKey = `${yyyy}${mm}${dd}`;
    const prefix  = `QCZ${dateKey}`;
    // Only look at BASE references (no -N suffix) so duplicates like QCZ...-2 don't corrupt the counter
    const rows: any[] = sqlite.prepare("SELECT reference FROM sales_quotes WHERE reference LIKE ?").all(`${prefix}%`);
    let maxSeq = 0;
    for (const r of rows) {
      // A base ref matches exactly QCZ + 8 digits + 3-digit seq (15 chars total), no dash after
      const m = r.reference.match(/^QCZ\d{8}(\d{3})$/);
      if (m) { const n = parseInt(m[1], 10); if (n > maxSeq) maxSeq = n; }
    }
    const seq = maxSeq + 1;
    res.json({ reference: `${prefix}${String(seq).padStart(3, "0")}` });
  });

  // Duplicate a quote: creates a new record with reference = baseRef + "-N"
  app.post("/api/sales-quotes/duplicate", (req, res) => {
    const { baseRef: rawBaseRef, data = {} } = req.body;
    if (!rawBaseRef) return res.status(400).json({ error: "baseRef required" });
    // Always normalise to root reference — strip any trailing -N suffix
    // This ensures QCZ...-2 duplicated always creates QCZ...-3, never QCZ...-2-2
    const baseRef = rawBaseRef.replace(/-\d+$/, "");
    // Find next available suffix among ALL siblings (QCZ...-2, -3, -4...)
    const siblings: any[] = sqlite.prepare(
      "SELECT reference FROM sales_quotes WHERE reference LIKE ?"
    ).all(`${baseRef}-%`);
    let maxSuffix = 1;
    for (const s of siblings) {
      // Only count direct children: baseRef + "-" + digits (no further dashes)
      const m = s.reference.match(new RegExp(`^${baseRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`));
      if (m) { const n = parseInt(m[1], 10); if (n > maxSuffix) maxSuffix = n; }
    }
    let suffix = maxSuffix + 1;
    let newRef = `${baseRef}-${suffix}`;
    // Extra safety: skip if it somehow exists
    while (sqlite.prepare("SELECT id FROM sales_quotes WHERE reference = ?").get(newRef)) {
      suffix++;
      newRef = `${baseRef}-${suffix}`;
    }
    const now = Date.now();
    const fields = [
      "reference", "method", "customer_name", "customer_email", "customer_contact", "customer_phone",
      "direction", "service_type", "incoterm", "ready_date",
      "origin", "destination", "pickup", "delivery", "transit",
      "commodity", "stackable", "dangerous", "packages", "weight", "cbm",
      "packages_json", "buying_lines_json", "selling_lines_json",
      "shipping_terms", "shipping_terms_notes",
      "status", "created_at"
    ];
    const values = fields.map(f => {
      if (f === "reference") return newRef;
      if (f === "method") return data.method || "duplicate";
      if (f === "status") return "Draft";
      if (f === "created_at") return now;
      return data[f] ?? "";
    });
    const placeholders = fields.map(() => "?").join(",");
    const info = sqlite.prepare(`INSERT INTO sales_quotes (${fields.join(",")}) VALUES (${placeholders})`).run(...values);
    const row = sqlite.prepare("SELECT * FROM sales_quotes WHERE id = ?").get(info.lastInsertRowid);
    res.json(row);
  });

  app.post("/api/sales-quotes", (req, res) => {
    const { reference, method = "manual", customer_name = "", customer_email = "", customer_contact = "", customer_phone = "" } = req.body;
    if (!reference) return res.status(400).json({ error: "reference required" });
    const existing = sqlite.prepare("SELECT id FROM sales_quotes WHERE reference = ?").get(reference);
    if (existing) return res.status(409).json({ error: "Reference already exists — cannot reuse." });
    const info = sqlite.prepare("INSERT INTO sales_quotes (reference, method, customer_name, customer_email, customer_contact, customer_phone, status, created_at) VALUES (?,?,?,?,?,?,?,?)").run(reference, method, customer_name, customer_email, customer_contact, customer_phone, "Draft", Date.now());
    res.json(sqlite.prepare("SELECT * FROM sales_quotes WHERE id = ?").get(info.lastInsertRowid));
  });

  app.patch("/api/sales-quotes/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const fields = req.body as Record<string, any>;
    const cols = Object.keys(fields).map(k => `${k} = ?`).join(", ");
    if (!cols) return res.status(400).json({ error: "no fields" });
    sqlite.prepare(`UPDATE sales_quotes SET ${cols} WHERE id = ?`).run(...Object.values(fields), id);
    res.json(sqlite.prepare("SELECT * FROM sales_quotes WHERE id = ?").get(id));
  });

  // ── Quote lifecycle status transition ────────────────────────────────────────
  app.patch("/api/sales-quotes/:id/status", (req, res) => {
    const id = parseInt(req.params.id);
    const { quote_status, substatus, lost_reason, lost_comment, validity_days, win_probability, user = "Luky Slavik", comment } = req.body as Record<string, any>;
    const row: any = sqlite.prepare("SELECT * FROM sales_quotes WHERE id = ?").get(id);
    if (!row) return res.status(404).json({ error: "not found" });

    // Parse existing timeline
    let timeline: any[] = [];
    try { timeline = JSON.parse(row.status_timeline_json || "[]"); } catch {}

    // Append timeline entry
    timeline.push({
      status: quote_status,
      substatus: substatus || null,
      ts: Date.now(),
      user: user || "Luky Slavik",
      comment: comment || null,
      lost_reason: lost_reason || null,
    });

    const WIN_PROB: Record<string, number> = {
      draft: 10, ready_to_send: 20, quoted: 30,
      feedback: 60, revised: 50, won: 100, lost: 0, expired: 0,
    };

    const updates: Record<string, any> = {
      quote_status,
      status_timeline_json: JSON.stringify(timeline),
      win_probability: win_probability ?? WIN_PROB[quote_status] ?? row.win_probability,
    };
    if (substatus !== undefined) updates.substatus = substatus;
    if (lost_reason !== undefined) updates.lost_reason = lost_reason;
    if (lost_comment !== undefined) updates.lost_comment = lost_comment;
    if (validity_days !== undefined) updates.validity_days = validity_days;
    if (quote_status === "quoted" && !row.sent_at) updates.sent_at = Date.now();

    const cols = Object.keys(updates).map(k => `${k} = ?`).join(", ");
    sqlite.prepare(`UPDATE sales_quotes SET ${cols} WHERE id = ?`).run(...Object.values(updates), id);
    res.json(sqlite.prepare("SELECT * FROM sales_quotes WHERE id = ?").get(id));
  });

  // ── User preferences (column picker, etc.) ──────────────────────────────────
  app.get("/api/prefs/:key", (req, res) => {
    const row: any = sqlite.prepare("SELECT value FROM user_preferences WHERE user_key = ?").get(req.params.key);
    res.json({ value: row ? row.value : null });
  });

  app.put("/api/prefs/:key", (req, res) => {
    const { value } = req.body as { value: string };
    sqlite.prepare(`INSERT INTO user_preferences (user_key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(req.params.key, value, Date.now());
    res.json({ ok: true });
  });

  // ── ARES lookup ─────────────────────────────────────────────────────────────
  app.get("/api/ares/:ico", async (req, res) => {
    const { ico } = req.params;
    if (!/^\d{8}$/.test(ico)) {
      return res.status(400).json({ error: "IČO must be exactly 8 digits" });
    }
    try {
      const data = await fetchAres(ico);
      res.json(data);
    } catch (err: any) {
      res.status(404).json({ error: err.message || "Company not found in registry" });
    }
  });

  // ── Customers ───────────────────────────────────────────────────────────────
  app.get("/api/customers", (req, res) => {
    const { search, status, salesOwner, country, sortBy } = req.query;
    const customers = storage.getCustomers({
      search: search as string,
      status: status as string,
      salesOwner: salesOwner as string,
      country: country as string,
      sortBy: sortBy as string,
    });
    res.json(customers);
  });

  app.get("/api/customers/:id", (req, res) => {
    const c = storage.getCustomer(parseInt(req.params.id));
    if (!c) return res.status(404).json({ error: "Not found" });
    res.json(c);
  });

  app.post("/api/customers", (req, res) => {
    const body = req.body;
    // Check for duplicate ICO
    const existing = storage.getCustomerByIco(body.ico);
    if (existing) return res.status(409).json({ error: "duplicate", customer: existing });
    const c = storage.createCustomer(body);
    res.json(c);
  });

  app.patch("/api/customers/:id", (req, res) => {
    const c = storage.updateCustomer(parseInt(req.params.id), req.body);
    res.json(c);
  });

  app.delete("/api/customers/:id", (req, res) => {
    storage.deleteCustomer(parseInt(req.params.id));
    res.json({ ok: true });
  });

  // ── Contacts ────────────────────────────────────────────────────────────────
  app.get("/api/customers/:id/contacts", (req, res) => {
    res.json(storage.getContacts(parseInt(req.params.id)));
  });
  app.post("/api/customers/:id/contacts", (req, res) => {
    const c = storage.createContact({ ...req.body, customerId: parseInt(req.params.id) });
    res.json(c);
  });
  app.patch("/api/contacts/:id", (req, res) => {
    res.json(storage.updateContact(parseInt(req.params.id), req.body));
  });
  app.delete("/api/contacts/:id", (req, res) => {
    storage.deleteContact(parseInt(req.params.id));
    res.json({ ok: true });
  });

  // ── Shipments ────────────────────────────────────────────────────────────────
  app.get("/api/customers/:id/shipments", (req, res) => {
    res.json(storage.getShipments(parseInt(req.params.id)));
  });
  app.post("/api/customers/:id/shipments", (req, res) => {
    const s = storage.createShipment({ ...req.body, customerId: parseInt(req.params.id) });
    res.json(s);
  });
  app.patch("/api/shipments/:id", (req, res) => {
    res.json(storage.updateShipment(parseInt(req.params.id), req.body));
  });
  app.delete("/api/shipments/:id", (req, res) => {
    storage.deleteShipment(parseInt(req.params.id));
    res.json({ ok: true });
  });

  // ── Quotes ───────────────────────────────────────────────────────────────────
  app.get("/api/customers/:id/quotes", (req, res) => {
    res.json(storage.getQuotes(parseInt(req.params.id)));
  });
  app.post("/api/customers/:id/quotes", (req, res) => {
    const q = storage.createQuote({ ...req.body, customerId: parseInt(req.params.id) });
    res.json(q);
  });
  app.patch("/api/quotes/:id", (req, res) => {
    res.json(storage.updateQuote(parseInt(req.params.id), req.body));
  });
  app.delete("/api/quotes/:id", (req, res) => {
    storage.deleteQuote(parseInt(req.params.id));
    res.json({ ok: true });
  });

  // ── Invoices ─────────────────────────────────────────────────────────────────
  app.get("/api/customers/:id/invoices", (req, res) => {
    res.json(storage.getInvoices(parseInt(req.params.id)));
  });
  app.post("/api/customers/:id/invoices", (req, res) => {
    const inv = storage.createInvoice({ ...req.body, customerId: parseInt(req.params.id) });
    res.json(inv);
  });
  app.patch("/api/invoices/:id", (req, res) => {
    res.json(storage.updateInvoice(parseInt(req.params.id), req.body));
  });
  app.delete("/api/invoices/:id", (req, res) => {
    storage.deleteInvoice(parseInt(req.params.id));
    res.json({ ok: true });
  });

  // ── Documents ────────────────────────────────────────────────────────────────
  app.get("/api/customers/:id/documents", (req, res) => {
    res.json(storage.getDocuments(parseInt(req.params.id)));
  });
  app.post("/api/customers/:id/documents", (req, res) => {
    const d = storage.createDocument({ ...req.body, customerId: parseInt(req.params.id), uploadedAt: Date.now() });
    res.json(d);
  });
  app.delete("/api/documents/:id", (req, res) => {
    storage.deleteDocument(parseInt(req.params.id));
    res.json({ ok: true });
  });

  // ── Notes ─────────────────────────────────────────────────────────────────────
  app.get("/api/customers/:id/notes", (req, res) => {
    res.json(storage.getNotes(parseInt(req.params.id)));
  });
  app.post("/api/customers/:id/notes", (req, res) => {
    const n = storage.createNote({ ...req.body, customerId: parseInt(req.params.id) });
    res.json(n);
  });
  app.delete("/api/notes/:id", (req, res) => {
    storage.deleteNote(parseInt(req.params.id));
    res.json({ ok: true });
  });

  // ── Logo ───────────────────────────────────────────────────────
  // Auto-fetch logo from website domain
  app.post("/api/customers/:id/logo/fetch", async (req, res) => {
    const id = parseInt(req.params.id);
    const customer = storage.getCustomer(id);
    if (!customer) return res.status(404).json({ error: "Not found" });
    const website = req.body?.website || customer.companyWebsite || "";
    if (!website) return res.status(400).json({ error: "No website provided" });
    // Delete old logo file if exists
    if (customer.logoPath) deleteLogo(customer.logoPath);
    const result = await fetchLogo(website, id);
    if (!result) return res.status(422).json({ error: "Could not find logo" });
    const updated = storage.updateCustomer(id, {
      companyWebsite: website,
      logoPath: result.localPath,
      logoSource: result.sourceUrl,
      logoUpdatedAt: result.updatedAt,
    });
    res.json({ ok: true, logoPath: result.localPath, customer: updated });
  });

  // Manual logo upload (multipart/form-data — simplified: base64 JSON)
  app.post("/api/customers/:id/logo/upload", async (req, res) => {
    const id = parseInt(req.params.id);
    const customer = storage.getCustomer(id);
    if (!customer) return res.status(404).json({ error: "Not found" });
    const { dataUrl, filename } = req.body;
    if (!dataUrl || !filename) return res.status(400).json({ error: "Missing data" });
    // Validate extension
    const ext = path.extname(filename).toLowerCase().slice(1);
    if (!["png", "jpg", "jpeg", "webp", "svg"].includes(ext)) {
      return res.status(400).json({ error: "Invalid file type" });
    }
    // Decode base64
    const base64Data = dataUrl.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length > 2 * 1024 * 1024) return res.status(400).json({ error: "File too large (max 2MB)" });
    // Delete old
    if (customer.logoPath) deleteLogo(customer.logoPath);
    const newFilename = `customer_${id}_upload.${ext}`;
    fs.writeFileSync(path.join(getLogoDir(), newFilename), buffer);
    const updated = storage.updateCustomer(id, {
      logoPath: `/logos/${newFilename}`,
      logoSource: "manual-upload",
      logoUpdatedAt: new Date().toISOString().split("T")[0],
    });
    res.json({ ok: true, logoPath: `/logos/${newFilename}`, customer: updated });
  });

  // Delete logo
  app.delete("/api/customers/:id/logo", (req, res) => {
    const id = parseInt(req.params.id);
    const customer = storage.getCustomer(id);
    if (!customer) return res.status(404).json({ error: "Not found" });
    if (customer.logoPath) deleteLogo(customer.logoPath);
    const updated = storage.updateCustomer(id, { logoPath: "", logoSource: "", logoUpdatedAt: "" });
    res.json({ ok: true, customer: updated });
  });

  // ── Terms & Conditions API ──────────────────────────────────────────────────────────
  app.get("/api/terms-conditions", (_req, res) => {
    const rows = sqlite.prepare("SELECT * FROM terms_conditions ORDER BY id ASC").all();
    res.json(rows);
  });

  app.get("/api/terms-conditions/:id", (req, res) => {
    const row = sqlite.prepare("SELECT * FROM terms_conditions WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  });

  app.post("/api/terms-conditions", (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
    const existing = sqlite.prepare("SELECT id FROM terms_conditions WHERE LOWER(name) = LOWER(?)").get(name.trim());
    if (existing) return res.status(409).json({ error: "A condition with this name already exists" });
    const now = Date.now();
    const result = sqlite.prepare(
      "INSERT INTO terms_conditions (name, includes, excludes, created_at, updated_at) VALUES (?,?,?,?,?)"
    ).run(name.trim(), "", "", now, now);
    const row = sqlite.prepare("SELECT * FROM terms_conditions WHERE id = ?").get(result.lastInsertRowid);
    res.json(row);
  });

  app.patch("/api/terms-conditions/:id", (req, res) => {
    const { name, includes, excludes } = req.body;
    const now = Date.now();
    const fields: string[] = [];
    const vals: any[] = [];
    if (name !== undefined) { fields.push("name = ?"); vals.push(name); }
    if (includes !== undefined) { fields.push("includes = ?"); vals.push(includes); }
    if (excludes !== undefined) { fields.push("excludes = ?"); vals.push(excludes); }
    if (fields.length === 0) return res.status(400).json({ error: "Nothing to update" });
    fields.push("updated_at = ?"); vals.push(now);
    vals.push(req.params.id);
    sqlite.prepare(`UPDATE terms_conditions SET ${fields.join(", ")} WHERE id = ?`).run(...vals);
    const row = sqlite.prepare("SELECT * FROM terms_conditions WHERE id = ?").get(req.params.id);
    res.json(row);
  });

  app.delete("/api/terms-conditions/:id", (req, res) => {
    sqlite.prepare("DELETE FROM terms_conditions WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  });

  return httpServer;
}

// ── ARES fetch helper ─────────────────────────────────────────────────────────
function fetchAres(ico: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`;
    const req = https.get(url, { headers: { Accept: "application/json", "User-Agent": "CustomersCRM/1.0" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 404 || res.statusCode === 204) {
          return reject(new Error("Company not found in ARES registry"));
        }
        try {
          const json = JSON.parse(data);
          // Map ARES response to our format
          const adresa = json.sidlo || {};
          const mapped = {
            ico: json.ico || ico,
            dic: json.dic || "",
            companyName: json.obchodniJmeno || json.nazev || "",
            legalForm: json.pravniForma || "",
            registeredAddress: [
              adresa.nazevUlice,
              adresa.cisloDomovni ? `${adresa.cisloDomovni}${adresa.cisloOrientacni ? "/" + adresa.cisloOrientacni : ""}` : "",
              adresa.nazevObce,
              adresa.psc,
            ].filter(Boolean).join(", "),
            city: adresa.nazevObce || "",
            country: "CZ",
            companyStatus: json.stavSubjektu || "Active",
            registrationDate: json.datumVzniku ? json.datumVzniku.split("T")[0] : "",
            nace: json.czNace ? json.czNace.join(", ") : "",
            dataSource: "ARES",
            lastRegistryUpdate: new Date().toISOString().split("T")[0],
          };
          resolve(mapped);
        } catch {
          reject(new Error("Failed to parse ARES response"));
        }
      });
    });
    req.on("error", () => reject(new Error("ARES registry unavailable")));
    req.setTimeout(8000, () => { req.destroy(); reject(new Error("ARES request timed out")); });
  });
}
