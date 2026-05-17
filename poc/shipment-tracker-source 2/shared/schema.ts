import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ─── Shipment persistence ─────────────────────────────────────────
// Stores new shipments, field-level edits, and soft-deletes as a
// change-log on top of the hardcoded SHIPMENTS base data.

export const shipmentEdits = sqliteTable("shipment_edits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // "create" = new row, "update" = field change, "delete" = soft-delete
  action: text("action").notNull(),
  // For create/update/delete – the shipment's job number (or temp id for new rows)
  jobKey: text("job_key").notNull(),
  // JSON blob: full shipment for "create", partial fields for "update", empty for "delete"
  payload: text("payload").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
});

export const insertShipmentEditSchema = createInsertSchema(shipmentEdits).omit({
  id: true,
});

export type InsertShipmentEdit = z.infer<typeof insertShipmentEditSchema>;
export type ShipmentEdit = typeof shipmentEdits.$inferSelect;

// ─── Invoicing ────────────────────────────────────────────────────
// One row per (jobNumber + cost category). Stores estimated & real
// costs, currency, invoice number, vendor for the 6 fixed categories.

export const invoiceCosts = sqliteTable("invoice_costs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobNumber: text("job_number").notNull(),
  category: text("category").notNull(), // freight, collection, locals, others, insurance, customs
  estAmount: text("est_amount").notNull().default(""),
  estCurrency: text("est_currency").notNull().default("CZK"),
  realAmount: text("real_amount").notNull().default(""),
  realCurrency: text("real_currency").notNull().default("CZK"),
  invoiceNumber: text("invoice_number").notNull().default(""),
  vendor: text("vendor").notNull().default(""),
});

export const insertInvoiceCostSchema = createInsertSchema(invoiceCosts).omit({ id: true });
export type InsertInvoiceCost = z.infer<typeof insertInvoiceCostSchema>;
export type InvoiceCost = typeof invoiceCosts.$inferSelect;

// Dynamic "Other additional charges" rows
export const invoiceAdditionalCharges = sqliteTable("invoice_additional_charges", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobNumber: text("job_number").notNull(),
  invoiceNumber: text("invoice_number").notNull().default(""),
  vendor: text("vendor").notNull().default(""),
  description: text("description").notNull().default(""),
  estAmount: text("est_amount").notNull().default(""),
  estCurrency: text("est_currency").notNull().default("CZK"),
  realAmount: text("real_amount").notNull().default(""),
  realCurrency: text("real_currency").notNull().default("CZK"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertInvoiceAdditionalChargeSchema = createInsertSchema(invoiceAdditionalCharges).omit({ id: true });
export type InsertInvoiceAdditionalCharge = z.infer<typeof insertInvoiceAdditionalChargeSchema>;
export type InvoiceAdditionalCharge = typeof invoiceAdditionalCharges.$inferSelect;

// ─── Billing ──────────────────────────────────────────────────────
// Per-job billing settings (single billing currency + ROE)

export const billingSettings = sqliteTable("billing_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobNumber: text("job_number").notNull().unique(),
  billingCurrency: text("billing_currency").notNull().default("CZK"),
  roe: text("roe").notNull().default("1"), // Rate of exchange (text to preserve precision)
  quoteRef: text("quote_ref").default(""), // Reference to the source Quote, e.g. "CZQ00000001-001"
});

export const insertBillingSettingsSchema = createInsertSchema(billingSettings).omit({ id: true });
export type InsertBillingSettings = z.infer<typeof insertBillingSettingsSchema>;
export type BillingSettings = typeof billingSettings.$inferSelect;

// Per-job+category billing amount overrides (when user wants to manually adjust)
export const billingOverrides = sqliteTable("billing_overrides", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobNumber: text("job_number").notNull(),
  // "freight", "collection", etc. for fixed rows; "additional-{id}" for extra charges
  rowKey: text("row_key").notNull(),
  billingAmount: text("billing_amount").notNull().default(""),
});

export const insertBillingOverrideSchema = createInsertSchema(billingOverrides).omit({ id: true });
export type InsertBillingOverride = z.infer<typeof insertBillingOverrideSchema>;
export type BillingOverride = typeof billingOverrides.$inferSelect;

// Generated invoice numbers — sequence per job number
export const generatedInvoices = sqliteTable("generated_invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobNumber: text("job_number").notNull(),
  invoiceNumber: text("invoice_number").notNull().unique(), // e.g. CZ25000037-001
  invoiceType: text("invoice_type").notNull(), // "breakdown" or "total"
  billingCurrency: text("billing_currency").notNull(),
  totalAmount: text("total_amount").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertGeneratedInvoiceSchema = createInsertSchema(generatedInvoices).omit({ id: true });
export type InsertGeneratedInvoice = z.infer<typeof insertGeneratedInvoiceSchema>;
export type GeneratedInvoice = typeof generatedInvoices.$inferSelect;

// ─── Quotes ────────────────────────────────────────────────────────
// Each quote is a single row with all fields stored as JSON blob.

export const quotes = sqliteTable("quotes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  quoteNumber: text("quote_number").notNull().unique(),
  data: text("data").notNull().default("{}"), // JSON blob of all column values
  createdAt: text("created_at").notNull(),
});

export const insertQuoteSchema = createInsertSchema(quotes).omit({ id: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotes.$inferSelect;

// ─── Shipment Comments (Chat) ──────────────────────────────────

export const shipmentComments = sqliteTable("shipment_comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobNumber: text("job_number").notNull(),
  author: text("author").notNull().default("User"),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertShipmentCommentSchema = createInsertSchema(shipmentComments).omit({ id: true });
export type InsertShipmentComment = z.infer<typeof insertShipmentCommentSchema>;
export type ShipmentComment = typeof shipmentComments.$inferSelect;

// ─── Shipment Tasks (checkboxes) ──────────────────────────────

export const shipmentTasks = sqliteTable("shipment_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobNumber: text("job_number").notNull(),
  taskKey: text("task_key").notNull(), // e.g. "booking_to_agent"
  completed: integer("completed").notNull().default(0), // 0 or 1
  completedAt: text("completed_at"),
  completedBy: text("completed_by"), // user email who checked it
});

export const insertShipmentTaskSchema = createInsertSchema(shipmentTasks).omit({ id: true });
export type InsertShipmentTask = z.infer<typeof insertShipmentTaskSchema>;
export type ShipmentTask = typeof shipmentTasks.$inferSelect;

// ─── Shipment Attachments (file metadata) ────────────────────

export const shipmentAttachments = sqliteTable("shipment_attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobNumber: text("job_number").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull().default(0),
  fileType: text("file_type").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

export const insertShipmentAttachmentSchema = createInsertSchema(shipmentAttachments).omit({ id: true });
export type InsertShipmentAttachment = z.infer<typeof insertShipmentAttachmentSchema>;
export type ShipmentAttachment = typeof shipmentAttachments.$inferSelect;

// ─── App Users (login system) ──────────────────────────────

export const appUsers = sqliteTable("app_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull().default(""),
  role: text("role").notNull().default("user"), // "admin" or "user"
  createdAt: text("created_at").notNull(),
});

export const insertAppUserSchema = createInsertSchema(appUsers).omit({ id: true });
export type InsertAppUser = z.infer<typeof insertAppUserSchema>;
export type AppUser = typeof appUsers.$inferSelect;

// ─── Automation Log ───────────────────────────────────────

export const automationLog = sqliteTable("automation_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobNumber: text("job_number").notNull(),
  ruleName: text("rule_name").notNull(),
  action: text("action").notNull(), // e.g. "email_sent"
  details: text("details").notNull().default(""), // JSON or text
  triggeredBy: text("triggered_by").notNull().default(""), // user email
  createdAt: text("created_at").notNull(),
});

export const insertAutomationLogSchema = createInsertSchema(automationLog).omit({ id: true });
export type InsertAutomationLog = z.infer<typeof insertAutomationLogSchema>;
export type AutomationLog = typeof automationLog.$inferSelect;
