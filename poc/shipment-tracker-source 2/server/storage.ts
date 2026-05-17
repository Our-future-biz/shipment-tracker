import {
  type User, type InsertUser, users,
  shipmentEdits, type ShipmentEdit, type InsertShipmentEdit,
  invoiceCosts, type InvoiceCost, type InsertInvoiceCost,
  invoiceAdditionalCharges, type InvoiceAdditionalCharge, type InsertInvoiceAdditionalCharge,
  billingSettings, type BillingSettings, type InsertBillingSettings,
  billingOverrides, type BillingOverride, type InsertBillingOverride,
  generatedInvoices, type GeneratedInvoice, type InsertGeneratedInvoice,
  quotes, type Quote, type InsertQuote,
  shipmentComments, type ShipmentComment, type InsertShipmentComment,
  shipmentTasks, type ShipmentTask, type InsertShipmentTask,
  shipmentAttachments, type ShipmentAttachment, type InsertShipmentAttachment,
  appUsers, type AppUser, type InsertAppUser,
  automationLog, type AutomationLog, type InsertAutomationLog,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, asc, and } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const rawDb = sqlite; // raw better-sqlite3 handle for direct SQL
export const db = drizzle(sqlite);

// ─── Lightweight schema migration ───────────────────────────────────
// SQLite is permissive about adding nullable columns to existing tables.
// We use ALTER TABLE ... ADD COLUMN with a try/catch so the call is idempotent
// (the second run no-ops because the column already exists).
function safeAddColumn(table: string, columnDef: string) {
  try {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch (err) {
    // "duplicate column name" means the column already exists — ignore.
    const msg = (err as Error)?.message || "";
    if (!/duplicate column|already exists/i.test(msg)) throw err;
  }
}
safeAddColumn("billing_settings", `quote_ref TEXT DEFAULT ''`);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  // Shipment persistence
  getAllEdits(): ShipmentEdit[];
  addEdit(edit: InsertShipmentEdit): ShipmentEdit;
  deleteEditsByJobKey(jobKey: string): void;
  // Invoicing
  getInvoiceCosts(jobNumber: string): InvoiceCost[];
  upsertInvoiceCost(data: InsertInvoiceCost): InvoiceCost;
  getAdditionalCharges(jobNumber: string): InvoiceAdditionalCharge[];
  addAdditionalCharge(data: InsertInvoiceAdditionalCharge): InvoiceAdditionalCharge;
  updateAdditionalCharge(id: number, data: Partial<InsertInvoiceAdditionalCharge>): InvoiceAdditionalCharge | undefined;
  deleteAdditionalCharge(id: number): void;
  // Billing
  getBillingSettings(jobNumber: string): BillingSettings | undefined;
  getAllBillingSettings(): BillingSettings[];
  upsertBillingSettings(data: InsertBillingSettings): BillingSettings;
  getBillingOverrides(jobNumber: string): BillingOverride[];
  upsertBillingOverride(jobNumber: string, rowKey: string, billingAmount: string): BillingOverride;
  getGeneratedInvoices(jobNumber: string): GeneratedInvoice[];
  getNextInvoiceNumber(jobNumber: string): string;
  createGeneratedInvoice(data: InsertGeneratedInvoice): GeneratedInvoice;
  // Quotes
  getAllQuotes(): Quote[];
  getQuote(quoteNumber: string): Quote | undefined;
  createQuote(data: InsertQuote): Quote;
  updateQuote(quoteNumber: string, dataBlob: string): Quote | undefined;
  deleteQuote(quoteNumber: string): void;
  // Comments
  getComments(jobNumber: string): ShipmentComment[];
  addComment(data: InsertShipmentComment): ShipmentComment;
  deleteComment(id: number): void;
  // Tasks
  getTasks(jobNumber: string): ShipmentTask[];
  upsertTask(jobNumber: string, taskKey: string, completed: number, completedBy?: string): ShipmentTask;
  // Attachments
  getAttachments(jobNumber: string): ShipmentAttachment[];
  addAttachment(data: InsertShipmentAttachment): ShipmentAttachment;
  deleteAttachment(id: number): void;
  // Auth
  getAppUserByEmail(email: string): AppUser | undefined;
  createAppUser(data: InsertAppUser): AppUser;
  // Automation
  addAutomationLog(data: InsertAutomationLog): AutomationLog;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.username, username)).get();
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    return db.insert(users).values(insertUser).returning().get();
  }

  // ─── Shipment edits ────────────────────────────────────────────────
  getAllEdits(): ShipmentEdit[] {
    return db.select().from(shipmentEdits).orderBy(asc(shipmentEdits.id)).all();
  }

  addEdit(edit: InsertShipmentEdit): ShipmentEdit {
    return db.insert(shipmentEdits).values(edit).returning().get();
  }

  deleteEditsByJobKey(jobKey: string): void {
    db.delete(shipmentEdits).where(eq(shipmentEdits.jobKey, jobKey)).run();
  }

  // ─── Invoicing ────────────────────────────────────────────────────
  getInvoiceCosts(jobNumber: string): InvoiceCost[] {
    return db.select().from(invoiceCosts)
      .where(eq(invoiceCosts.jobNumber, jobNumber))
      .all();
  }

  upsertInvoiceCost(data: InsertInvoiceCost): InvoiceCost {
    // Check if row already exists for this job+category
    const existing = db.select().from(invoiceCosts)
      .where(and(eq(invoiceCosts.jobNumber, data.jobNumber), eq(invoiceCosts.category, data.category)))
      .get();
    if (existing) {
      return db.update(invoiceCosts)
        .set({
          estAmount: data.estAmount,
          estCurrency: data.estCurrency,
          realAmount: data.realAmount,
          realCurrency: data.realCurrency,
          invoiceNumber: data.invoiceNumber,
          vendor: data.vendor,
        })
        .where(eq(invoiceCosts.id, existing.id))
        .returning().get();
    }
    return db.insert(invoiceCosts).values(data).returning().get();
  }

  getAdditionalCharges(jobNumber: string): InvoiceAdditionalCharge[] {
    return db.select().from(invoiceAdditionalCharges)
      .where(eq(invoiceAdditionalCharges.jobNumber, jobNumber))
      .orderBy(asc(invoiceAdditionalCharges.sortOrder))
      .all();
  }

  addAdditionalCharge(data: InsertInvoiceAdditionalCharge): InvoiceAdditionalCharge {
    return db.insert(invoiceAdditionalCharges).values(data).returning().get();
  }

  updateAdditionalCharge(id: number, data: Partial<InsertInvoiceAdditionalCharge>): InvoiceAdditionalCharge | undefined {
    return db.update(invoiceAdditionalCharges)
      .set(data)
      .where(eq(invoiceAdditionalCharges.id, id))
      .returning().get();
  }

  deleteAdditionalCharge(id: number): void {
    db.delete(invoiceAdditionalCharges).where(eq(invoiceAdditionalCharges.id, id)).run();
  }

  // ─── Billing ─────────────────────────────────────────────────────
  getBillingSettings(jobNumber: string): BillingSettings | undefined {
    return db.select().from(billingSettings)
      .where(eq(billingSettings.jobNumber, jobNumber))
      .get();
  }

  getAllBillingSettings(): BillingSettings[] {
    return db.select().from(billingSettings).all();
  }

  upsertBillingSettings(data: InsertBillingSettings): BillingSettings {
    const existing = db.select().from(billingSettings)
      .where(eq(billingSettings.jobNumber, data.jobNumber))
      .get();
    if (existing) {
      // Build a partial update so callers can persist only the fields they want.
      // Notably, the Invoicing tab's currency/ROE inputs should NOT clobber the
      // separately-set quoteRef, and vice-versa.
      const updates: Partial<InsertBillingSettings> = {};
      if (data.billingCurrency !== undefined) updates.billingCurrency = data.billingCurrency;
      if (data.roe !== undefined) updates.roe = data.roe;
      if (data.quoteRef !== undefined) updates.quoteRef = data.quoteRef;
      return db.update(billingSettings)
        .set(updates)
        .where(eq(billingSettings.id, existing.id))
        .returning().get();
    }
    return db.insert(billingSettings).values(data).returning().get();
  }

  getBillingOverrides(jobNumber: string): BillingOverride[] {
    return db.select().from(billingOverrides)
      .where(eq(billingOverrides.jobNumber, jobNumber))
      .all();
  }

  upsertBillingOverride(jobNumber: string, rowKey: string, billingAmount: string): BillingOverride {
    const existing = db.select().from(billingOverrides)
      .where(and(eq(billingOverrides.jobNumber, jobNumber), eq(billingOverrides.rowKey, rowKey)))
      .get();
    if (existing) {
      return db.update(billingOverrides)
        .set({ billingAmount })
        .where(eq(billingOverrides.id, existing.id))
        .returning().get();
    }
    return db.insert(billingOverrides).values({ jobNumber, rowKey, billingAmount }).returning().get();
  }

  getGeneratedInvoices(jobNumber: string): GeneratedInvoice[] {
    return db.select().from(generatedInvoices)
      .where(eq(generatedInvoices.jobNumber, jobNumber))
      .orderBy(asc(generatedInvoices.id))
      .all();
  }

  getNextInvoiceNumber(jobNumber: string): string {
    const existing = db.select().from(generatedInvoices)
      .where(eq(generatedInvoices.jobNumber, jobNumber))
      .all();
    const nextSeq = existing.length + 1;
    return `${jobNumber}-${String(nextSeq).padStart(3, "0")}`;
  }

  createGeneratedInvoice(data: InsertGeneratedInvoice): GeneratedInvoice {
    return db.insert(generatedInvoices).values(data).returning().get();
  }

  // ─── Quotes ────────────────────────────────────────────────────
  getAllQuotes(): Quote[] {
    return db.select().from(quotes).orderBy(asc(quotes.id)).all();
  }

  getQuote(quoteNumber: string): Quote | undefined {
    return db.select().from(quotes).where(eq(quotes.quoteNumber, quoteNumber)).get();
  }

  createQuote(data: InsertQuote): Quote {
    return db.insert(quotes).values(data).returning().get();
  }

  updateQuote(quoteNumber: string, dataBlob: string): Quote | undefined {
    return db.update(quotes)
      .set({ data: dataBlob })
      .where(eq(quotes.quoteNumber, quoteNumber))
      .returning().get();
  }

  deleteQuote(quoteNumber: string): void {
    // Soft-delete: mark as deleted in data JSON blob instead of hard-deleting
    // Preserves quote number sequence and allows recovery
    const quote = db.select().from(quotes).where(eq(quotes.quoteNumber, quoteNumber)).get();
    if (!quote) return;
    const data = typeof quote.data === "string" ? JSON.parse(quote.data) : (quote.data || {});
    data.__deleted__ = true;
    data.__deletedAt__ = new Date().toISOString();
    db.update(quotes).set({ data: JSON.stringify(data) }).where(eq(quotes.quoteNumber, quoteNumber)).run();
  }

  // ─── Comments ─────────────────────────────────────────────────
  getComments(jobNumber: string): ShipmentComment[] {
    return db.select().from(shipmentComments)
      .where(eq(shipmentComments.jobNumber, jobNumber))
      .orderBy(asc(shipmentComments.id))
      .all();
  }

  addComment(data: InsertShipmentComment): ShipmentComment {
    return db.insert(shipmentComments).values(data).returning().get();
  }

  deleteComment(id: number): void {
    db.delete(shipmentComments).where(eq(shipmentComments.id, id)).run();
  }

  // ─── Tasks ───────────────────────────────────────────────────
  getTasks(jobNumber: string): ShipmentTask[] {
    return db.select().from(shipmentTasks)
      .where(eq(shipmentTasks.jobNumber, jobNumber)).all();
  }

  upsertTask(jobNumber: string, taskKey: string, completed: number, completedBy?: string): ShipmentTask {
    const existing = db.select().from(shipmentTasks)
      .where(and(eq(shipmentTasks.jobNumber, jobNumber), eq(shipmentTasks.taskKey, taskKey)))
      .get();
    if (existing) {
      // Once completed, cannot be unchecked
      if (existing.completed === 1) return existing;
      return db.update(shipmentTasks)
        .set({ completed, completedAt: completed ? new Date().toISOString() : null, completedBy: completedBy || null })
        .where(eq(shipmentTasks.id, existing.id))
        .returning().get();
    }
    return db.insert(shipmentTasks).values({
      jobNumber, taskKey, completed,
      completedAt: completed ? new Date().toISOString() : null,
      completedBy: completedBy || null,
    }).returning().get();
  }

  // ─── Attachments ────────────────────────────────────────────
  getAttachments(jobNumber: string): ShipmentAttachment[] {
    return db.select().from(shipmentAttachments)
      .where(eq(shipmentAttachments.jobNumber, jobNumber))
      .orderBy(asc(shipmentAttachments.id)).all();
  }

  addAttachment(data: InsertShipmentAttachment): ShipmentAttachment {
    return db.insert(shipmentAttachments).values(data).returning().get();
  }

  deleteAttachment(id: number): void {
    db.delete(shipmentAttachments).where(eq(shipmentAttachments.id, id)).run();
  }

  // ─── Auth ────────────────────────────────────────────────────
  getAppUserByEmail(email: string): AppUser | undefined {
    return db.select().from(appUsers).where(eq(appUsers.email, email)).get();
  }

  createAppUser(data: InsertAppUser): AppUser {
    return db.insert(appUsers).values(data).returning().get();
  }

  // ─── Automation ──────────────────────────────────────────────
  addAutomationLog(data: InsertAutomationLog): AutomationLog {
    return db.insert(automationLog).values(data).returning().get();
  }
}

export const storage = new DatabaseStorage();
