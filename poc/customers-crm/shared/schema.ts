import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Customers ─────────────────────────────────────────────────────────────────
export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // ARES data
  ico: text("ico").notNull().unique(),
  dic: text("dic").default(""),
  companyName: text("company_name").notNull(),
  legalForm: text("legal_form").default(""),
  registeredAddress: text("registered_address").default(""),
  city: text("city").default(""),
  country: text("country").default("CZ"),
  companyStatus: text("company_status").default(""),
  registrationDate: text("registration_date").default(""),
  nace: text("nace").default(""),
  dataSource: text("data_source").default("ARES"),
  lastRegistryUpdate: text("last_registry_update").default(""),
  // CRM data
  status: text("status").notNull().default("Prospect"), // Active / Inactive / Prospect
  salesOwner: text("sales_owner").default(""),
  label: text("label").default("STANDARD"), // KEY ACCOUNT / STANDARD / RISK
  creditLimit: real("credit_limit").default(0),
  paymentTerms: text("payment_terms").default(""),          // PREPAYMENT / 7 days / 14 days / 30 days / 45 days / 60 days
  freightPaymentTerms: text("freight_payment_terms").default(""), // same options
  dutyPaymentTerms: text("duty_payment_terms").default(""),       // same options
  // Logo + website
  companyWebsite: text("company_website").default(""),
  logoPath: text("logo_path").default(""),       // relative path on disk
  logoSource: text("logo_source").default(""),   // url logo was fetched from
  logoUpdatedAt: text("logo_updated_at").default(""),
  totalRevenue: real("total_revenue").default(0),
  totalProfit: real("total_profit").default(0),
  totalShipments: integer("total_shipments").default(0),
  lastActivityDate: text("last_activity_date").default(""),
  createdAt: integer("created_at").notNull(),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;

// ── Contacts ──────────────────────────────────────────────────────────────────
export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").default(""),
  phone: text("phone").default(""),
  role: text("role").default("Operations"), // Sales / Operations / Finance
  isMain: integer("is_main").default(0), // 0 = false, 1 = true
  createdAt: integer("created_at").notNull(),
});

export const insertContactSchema = createInsertSchema(contacts).omit({ id: true, createdAt: true });
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

// ── Shipments ─────────────────────────────────────────────────────────────────
export const shipments = sqliteTable("shipments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  jobId: text("job_id").notNull(),
  transportMode: text("transport_mode").notNull().default("SEA"), // AIR / SEA / ROAD / RAIL
  direction: text("direction").notNull().default("IMPORT"), // IMPORT / EXPORT
  pol: text("pol").default(""), // port of loading
  pod: text("pod").default(""), // port of discharge
  status: text("status").notNull().default("In Progress"),
  eta: text("eta").default(""),
  etd: text("etd").default(""),
  revenue: real("revenue").default(0),
  cost: real("cost").default(0),
  profit: real("profit").default(0),
  completedAt: text("completed_at").default(""),
  createdAt: integer("created_at").notNull(),
});

export const insertShipmentSchema = createInsertSchema(shipments).omit({ id: true, createdAt: true });
export type InsertShipment = z.infer<typeof insertShipmentSchema>;
export type Shipment = typeof shipments.$inferSelect;

// ── Quotes ────────────────────────────────────────────────────────────────────
export const quotes = sqliteTable("quotes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  quoteNumber: text("quote_number").notNull(),
  status: text("status").notNull().default("Pending"), // Pending / Won / Lost
  validUntil: text("valid_until").default(""),
  revenue: real("revenue").default(0),
  description: text("description").default(""),
  createdAt: integer("created_at").notNull(),
});

export const insertQuoteSchema = createInsertSchema(quotes).omit({ id: true, createdAt: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotes.$inferSelect;

// ── Finance ───────────────────────────────────────────────────────────────────
export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  invoiceNumber: text("invoice_number").notNull(),
  amount: real("amount").notNull().default(0),
  dueDate: text("due_date").default(""),
  status: text("status").notNull().default("Open"), // Open / Overdue / Paid
  issuedAt: text("issued_at").default(""),
  createdAt: integer("created_at").notNull(),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

// ── Documents ─────────────────────────────────────────────────────────────────
export const documents = sqliteTable("documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().default("Other"), // Contract / NDA / Power of attorney / Customs / Other
  url: text("url").default(""),
  uploadedAt: integer("uploaded_at").notNull(),
});

export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

// ── Notes / Communication ─────────────────────────────────────────────────────
export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("Note"), // Note / Email / Call / Follow-up
  content: text("content").notNull(),
  author: text("author").default(""),
  createdAt: integer("created_at").notNull(),
});

export const insertNoteSchema = createInsertSchema(notes).omit({ id: true, createdAt: true });
export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Note = typeof notes.$inferSelect;
