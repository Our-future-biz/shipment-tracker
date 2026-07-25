import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, like, or, desc, asc, and } from "drizzle-orm";
import {
  customers, contacts, shipments, quotes, invoices, documents, notes,
  type Customer, type InsertCustomer,
  type Contact, type InsertContact,
  type Shipment, type InsertShipment,
  type Quote, type InsertQuote,
  type Invoice, type InsertInvoice,
  type Document, type InsertDocument,
  type Note, type InsertNote,
} from "@shared/schema";

export const sqlite = new Database(process.env.DATABASE_URL || "customers.db");
sqlite.pragma("journal_mode = WAL");
const db = drizzle(sqlite);

// ── Auto-migrate ──────────────────────────────────────────────────────────────
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ico TEXT NOT NULL UNIQUE,
    dic TEXT DEFAULT '',
    company_name TEXT NOT NULL,
    legal_form TEXT DEFAULT '',
    registered_address TEXT DEFAULT '',
    city TEXT DEFAULT '',
    country TEXT DEFAULT 'CZ',
    company_status TEXT DEFAULT '',
    registration_date TEXT DEFAULT '',
    nace TEXT DEFAULT '',
    data_source TEXT DEFAULT 'ARES',
    last_registry_update TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Prospect',
    sales_owner TEXT DEFAULT '',
    label TEXT DEFAULT 'STANDARD',
    credit_limit REAL DEFAULT 0,
    company_website TEXT DEFAULT '',
    logo_path TEXT DEFAULT '',
    logo_source TEXT DEFAULT '',
    logo_updated_at TEXT DEFAULT '',
    total_revenue REAL DEFAULT 0,
    total_profit REAL DEFAULT 0,
    total_shipments INTEGER DEFAULT 0,
    last_activity_date TEXT DEFAULT '',
    created_at INTEGER NOT NULL
  );
  -- safe migration for existing databases
  CREATE TABLE IF NOT EXISTS _migrations(id TEXT PRIMARY KEY);
  INSERT OR IGNORE INTO _migrations VALUES('v2_logo_website');


  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    role TEXT DEFAULT 'Operations',
    is_main INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS shipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    job_id TEXT NOT NULL,
    transport_mode TEXT NOT NULL DEFAULT 'SEA',
    direction TEXT NOT NULL DEFAULT 'IMPORT',
    pol TEXT DEFAULT '',
    pod TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'In Progress',
    eta TEXT DEFAULT '',
    etd TEXT DEFAULT '',
    revenue REAL DEFAULT 0,
    cost REAL DEFAULT 0,
    profit REAL DEFAULT 0,
    completed_at TEXT DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    quote_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending',
    valid_until TEXT DEFAULT '',
    revenue REAL DEFAULT 0,
    description TEXT DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    due_date TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Open',
    issued_at TEXT DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'Other',
    url TEXT DEFAULT '',
    uploaded_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'Note',
    content TEXT NOT NULL,
    author TEXT DEFAULT '',
    created_at INTEGER NOT NULL
  );
`);

// ── Terms & Conditions table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS terms_conditions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    includes TEXT DEFAULT '',
    excludes TEXT DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );
`);
// Seed default service types if table is empty
const tcCount = (sqlite.prepare("SELECT COUNT(*) as n FROM terms_conditions").get() as any).n;
if (tcCount === 0) {
  const ins = sqlite.prepare("INSERT INTO terms_conditions (name, includes, excludes, created_at, updated_at) VALUES (?,?,?,?,?)");
  const now = Date.now();
  for (const name of ["AIR IMPORT","AIR EXPORT","FCL IMPORT","FCL EXPORT","LCL IMPORT","LCL EXPORT"]) {
    ins.run(name, "", "", now, now);
  }
}

// ── Safe column migrations for existing databases ─────────────────────────────
for (const col of [
  "ALTER TABLE customers ADD COLUMN company_website TEXT DEFAULT ''",
  "ALTER TABLE customers ADD COLUMN logo_path TEXT DEFAULT ''",
  "ALTER TABLE customers ADD COLUMN logo_source TEXT DEFAULT ''",
  "ALTER TABLE customers ADD COLUMN logo_updated_at TEXT DEFAULT ''",
  "ALTER TABLE customers ADD COLUMN payment_terms TEXT DEFAULT ''",
  "ALTER TABLE customers ADD COLUMN freight_payment_terms TEXT DEFAULT ''",
  "ALTER TABLE customers ADD COLUMN duty_payment_terms TEXT DEFAULT ''",
]) {
  try { sqlite.exec(col); } catch { /* column already exists */ }
}

// ── Ensure sales_quotes table exists (created here if not already) ─────────
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS sales_quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT UNIQUE NOT NULL,
    customer_name TEXT DEFAULT '',
    customer_email TEXT DEFAULT '',
    customer_phone TEXT DEFAULT '',
    customer_contact TEXT DEFAULT '',
    direction TEXT DEFAULT '',
    incoterm TEXT DEFAULT '',
    ready_date TEXT DEFAULT '',
    origin TEXT DEFAULT '',
    destination TEXT DEFAULT '',
    pickup TEXT DEFAULT '',
    delivery TEXT DEFAULT '',
    commodity TEXT DEFAULT '',
    packages TEXT DEFAULT '',
    weight TEXT DEFAULT '',
    cbm TEXT DEFAULT '',
    buying_price TEXT DEFAULT '',
    selling_price TEXT DEFAULT '',
    currency TEXT DEFAULT 'EUR',
    additional_costs TEXT DEFAULT '',
    status TEXT DEFAULT 'Draft',
    method TEXT DEFAULT 'manual',
    created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_quotes_ref ON sales_quotes(reference);
`);
// Safe column additions for sales_quotes
for (const col of [
  "ALTER TABLE sales_quotes ADD COLUMN shipping_terms TEXT DEFAULT ''",
  "ALTER TABLE sales_quotes ADD COLUMN shipping_terms_notes TEXT DEFAULT ''",
  "ALTER TABLE sales_quotes ADD COLUMN packages_json TEXT DEFAULT '[]'",
  "ALTER TABLE sales_quotes ADD COLUMN buying_lines_json TEXT DEFAULT '[]'",
  "ALTER TABLE sales_quotes ADD COLUMN selling_lines_json TEXT DEFAULT '[]'",
  "ALTER TABLE sales_quotes ADD COLUMN service_type TEXT DEFAULT ''",
  "ALTER TABLE sales_quotes ADD COLUMN transit TEXT DEFAULT ''",
  "ALTER TABLE sales_quotes ADD COLUMN stackable INTEGER DEFAULT 0",
  "ALTER TABLE sales_quotes ADD COLUMN dangerous INTEGER DEFAULT 0",
  // Quote lifecycle columns (used by /api/sales-quotes/:id/status and the client)
  "ALTER TABLE sales_quotes ADD COLUMN quote_status TEXT DEFAULT 'draft'",
  "ALTER TABLE sales_quotes ADD COLUMN substatus TEXT DEFAULT ''",
  "ALTER TABLE sales_quotes ADD COLUMN lost_reason TEXT DEFAULT ''",
  "ALTER TABLE sales_quotes ADD COLUMN lost_comment TEXT DEFAULT ''",
  "ALTER TABLE sales_quotes ADD COLUMN validity_days INTEGER DEFAULT 14",
  "ALTER TABLE sales_quotes ADD COLUMN win_probability INTEGER DEFAULT 10",
  "ALTER TABLE sales_quotes ADD COLUMN sent_at INTEGER",
  "ALTER TABLE sales_quotes ADD COLUMN status_timeline_json TEXT DEFAULT '[]'",
]) {
  try { sqlite.exec(col); } catch { /* column already exists */ }
}

// ── User preferences (column picker, saved views) ─────────────────────────────
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS user_preferences (
    user_key TEXT PRIMARY KEY,
    value TEXT DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0
  );
`);

export interface IStorage {
  // Customers
  getCustomers(opts?: { search?: string; status?: string; salesOwner?: string; country?: string; sortBy?: string }): Customer[];
  getCustomer(id: number): Customer | undefined;
  getCustomerByIco(ico: string): Customer | undefined;
  createCustomer(c: InsertCustomer): Customer;
  updateCustomer(id: number, c: Partial<InsertCustomer>): Customer;
  deleteCustomer(id: number): void;
  recalcCustomerStats(id: number): void;

  // Contacts
  getContacts(customerId: number): Contact[];
  createContact(c: InsertContact): Contact;
  updateContact(id: number, c: Partial<InsertContact>): Contact;
  deleteContact(id: number): void;

  // Shipments
  getShipments(customerId: number): Shipment[];
  createShipment(s: InsertShipment): Shipment;
  updateShipment(id: number, s: Partial<InsertShipment>): Shipment;
  deleteShipment(id: number): void;

  // Quotes
  getQuotes(customerId: number): Quote[];
  createQuote(q: InsertQuote): Quote;
  updateQuote(id: number, q: Partial<InsertQuote>): Quote;
  deleteQuote(id: number): void;

  // Invoices
  getInvoices(customerId: number): Invoice[];
  createInvoice(i: InsertInvoice): Invoice;
  updateInvoice(id: number, i: Partial<InsertInvoice>): Invoice;
  deleteInvoice(id: number): void;

  // Documents
  getDocuments(customerId: number): Document[];
  createDocument(d: InsertDocument): Document;
  deleteDocument(id: number): void;

  // Notes
  getNotes(customerId: number): Note[];
  createNote(n: InsertNote): Note;
  deleteNote(id: number): void;
}

export class Storage implements IStorage {
  // ── Customers ──────────────────────────────────────────────────────────────
  getCustomers(opts?: { search?: string; status?: string; salesOwner?: string; country?: string; sortBy?: string }): Customer[] {
    let q = db.select().from(customers);
    const conditions = [];
    if (opts?.status) conditions.push(eq(customers.status, opts.status));
    if (opts?.salesOwner) conditions.push(eq(customers.salesOwner, opts.salesOwner));
    if (opts?.country) conditions.push(eq(customers.country, opts.country));
    if (opts?.search) {
      const s = `%${opts.search}%`;
      conditions.push(or(like(customers.companyName, s), like(customers.ico, s), like(customers.dic, s)) as any);
    }
    let result: Customer[];
    if (conditions.length > 0) {
      result = (q as any).where(and(...conditions) as any).all();
    } else {
      result = q.all();
    }
    const sortBy = opts?.sortBy ?? "createdAt";
    if (sortBy === "revenue") result.sort((a, b) => (b.totalRevenue ?? 0) - (a.totalRevenue ?? 0));
    else if (sortBy === "margin") {
      result.sort((a, b) => {
        const ma = a.totalRevenue ? ((a.totalProfit ?? 0) / a.totalRevenue) * 100 : 0;
        const mb = b.totalRevenue ? ((b.totalProfit ?? 0) / b.totalRevenue) * 100 : 0;
        return mb - ma;
      });
    } else if (sortBy === "lastActivity") {
      result.sort((a, b) => (b.lastActivityDate ?? "").localeCompare(a.lastActivityDate ?? ""));
    } else {
      result.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    }
    return result;
  }

  getCustomer(id: number): Customer | undefined {
    return db.select().from(customers).where(eq(customers.id, id)).get();
  }

  getCustomerByIco(ico: string): Customer | undefined {
    return db.select().from(customers).where(eq(customers.ico, ico)).get();
  }

  createCustomer(c: InsertCustomer): Customer {
    return db.insert(customers).values({ ...c, createdAt: Date.now() }).returning().get();
  }

  updateCustomer(id: number, c: Partial<InsertCustomer>): Customer {
    return db.update(customers).set(c).where(eq(customers.id, id)).returning().get();
  }

  deleteCustomer(id: number): void {
    db.delete(customers).where(eq(customers.id, id)).run();
  }

  recalcCustomerStats(id: number): void {
    const customerShipments = db.select().from(shipments).where(eq(shipments.customerId, id)).all();
    const completed = customerShipments.filter(s => s.status === "Completed");
    const totalRevenue = customerShipments.reduce((s, sh) => s + (sh.revenue ?? 0), 0);
    const totalProfit = completed.reduce((s, sh) => s + (sh.profit ?? 0), 0);
    const totalShipCount = customerShipments.length;
    const lastActivity = customerShipments.length > 0
      ? new Date(Math.max(...customerShipments.map(s => s.createdAt ?? 0))).toISOString().split("T")[0]
      : "";
    db.update(customers).set({ totalRevenue, totalProfit, totalShipments: totalShipCount, lastActivityDate: lastActivity }).where(eq(customers.id, id)).run();
  }

  // ── Contacts ───────────────────────────────────────────────────────────────
  getContacts(customerId: number): Contact[] {
    return db.select().from(contacts).where(eq(contacts.customerId, customerId)).all();
  }
  createContact(c: InsertContact): Contact {
    return db.insert(contacts).values({ ...c, createdAt: Date.now() }).returning().get();
  }
  updateContact(id: number, c: Partial<InsertContact>): Contact {
    return db.update(contacts).set(c).where(eq(contacts.id, id)).returning().get();
  }
  deleteContact(id: number): void {
    db.delete(contacts).where(eq(contacts.id, id)).run();
  }

  // ── Shipments ─────────────────────────────────────────────────────────────
  getShipments(customerId: number): Shipment[] {
    return db.select().from(shipments).where(eq(shipments.customerId, customerId)).all();
  }
  createShipment(s: InsertShipment): Shipment {
    const sh = db.insert(shipments).values({ ...s, createdAt: Date.now() }).returning().get();
    this.recalcCustomerStats(s.customerId);
    return sh;
  }
  updateShipment(id: number, s: Partial<InsertShipment>): Shipment {
    const sh = db.update(shipments).set(s).where(eq(shipments.id, id)).returning().get();
    this.recalcCustomerStats(sh.customerId);
    return sh;
  }
  deleteShipment(id: number): void {
    const sh = db.select().from(shipments).where(eq(shipments.id, id)).get();
    db.delete(shipments).where(eq(shipments.id, id)).run();
    if (sh) this.recalcCustomerStats(sh.customerId);
  }

  // ── Quotes ────────────────────────────────────────────────────────────────
  getQuotes(customerId: number): Quote[] {
    return db.select().from(quotes).where(eq(quotes.customerId, customerId)).all();
  }
  createQuote(q: InsertQuote): Quote {
    return db.insert(quotes).values({ ...q, createdAt: Date.now() }).returning().get();
  }
  updateQuote(id: number, q: Partial<InsertQuote>): Quote {
    return db.update(quotes).set(q).where(eq(quotes.id, id)).returning().get();
  }
  deleteQuote(id: number): void {
    db.delete(quotes).where(eq(quotes.id, id)).run();
  }

  // ── Invoices ──────────────────────────────────────────────────────────────
  getInvoices(customerId: number): Invoice[] {
    return db.select().from(invoices).where(eq(invoices.customerId, customerId)).all();
  }
  createInvoice(i: InsertInvoice): Invoice {
    return db.insert(invoices).values({ ...i, createdAt: Date.now() }).returning().get();
  }
  updateInvoice(id: number, i: Partial<InsertInvoice>): Invoice {
    return db.update(invoices).set(i).where(eq(invoices.id, id)).returning().get();
  }
  deleteInvoice(id: number): void {
    db.delete(invoices).where(eq(invoices.id, id)).run();
  }

  // ── Documents ─────────────────────────────────────────────────────────────
  getDocuments(customerId: number): Document[] {
    return db.select().from(documents).where(eq(documents.customerId, customerId)).all();
  }
  createDocument(d: InsertDocument): Document {
    return db.insert(documents).values({ ...d, uploadedAt: Date.now() }).returning().get();
  }
  deleteDocument(id: number): void {
    db.delete(documents).where(eq(documents.id, id)).run();
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  getNotes(customerId: number): Note[] {
    return db.select().from(notes).where(eq(notes.customerId, customerId)).all();
  }
  createNote(n: InsertNote): Note {
    return db.insert(notes).values({ ...n, createdAt: Date.now() }).returning().get();
  }
  deleteNote(id: number): void {
    db.delete(notes).where(eq(notes.id, id)).run();
  }
}

export const storage = new Storage();
