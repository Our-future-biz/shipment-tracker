import { sql } from "drizzle-orm";
import { pgTable, text, numeric, uuid, integer, boolean, date, timestamp, jsonb, index, uniqueIndex, check, foreignKey } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export type SupplierInvoiceStatus = "booked" | "approved" | "refused";
export type SupplierInvoiceKind = "invoice" | "credit_note";
/** How the record came to be: read by Document Reading, typed on a job, a master job's line, or gathered from older lines. */
export type SupplierInvoiceSource = "reading" | "typed" | "master_job" | "backfill";

/** A line of a refused invoice as it was when refused: it is taken off the job, the record keeps it. */
export interface RefusedLine {
  /** invoice_cost or master_job_cost */
  table: "invoice_cost" | "master_job_cost";
  lineId: string;
  /** The shipment (invoice_cost) or master job (master_job_cost) */
  ownerId: string;
  category: string;
  description: string;
  realQty: string | null;
  realAmount: string | null;
  realCurrency: string;
}

// An invoice received from a supplier (Council Outlay 9, 17 Nov 2026): one per supplier and invoice
// number, which the job's cost lines (invoice_cost) and a master job's lines (master_job_cost) point to.
// The lines stay the truth for cost and profit; the record holds what belongs to the invoice as a whole -
// its dates and totals as read, its file, whether a manager approved or refused it, and its payment.
// Trucking's haulier invoices are not here: they have their own record in Trucking.
export const supplierInvoiceTable = pgTable(
  "supplier_invoice",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    // Who the invoice is from, as its lines are matched: "c:<company>" (a Customer Database supplier),
    // "h:<company>" (a haulier), or "n:<name>" (a typed vendor, lib/supplierCosts nameKey).
    supplierKey: text("supplier_key").notNull(),
    supplierCustomerId: uuid("supplier_customer_id"),
    haulierId: uuid("haulier_id"),
    /** The supplier's name as written on the lines */
    vendor: text("vendor").notNull().default(""),
    invoiceNumber: text("invoice_number").notNull(),
    /** The number as lines are matched: no spaces, upper case (lib/invoiceLines invoiceNumberKey) */
    numberKey: text("number_key").notNull(),
    kind: text("kind").$type<SupplierInvoiceKind>().notNull().default("invoice"),
    // As read from the document; null when not known.
    issueDate: date("issue_date", { mode: "string" }),
    dueDate: date("due_date", { mode: "string" }),
    /** When the invoice was booked on a job (its first line's Received stamp) */
    receivedAt: timestamp("received_at", { withTimezone: true }),
    currency: text("currency").notNull().default(""),
    totalNet: numeric("total_net", { precision: 14, scale: 2 }),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2 }),
    totalGross: numeric("total_gross", { precision: 14, scale: 2 }),
    status: text("status").$type<SupplierInvoiceStatus>().notNull().default("booked"),
    // The manager who approved or refused it, when and why; whether they had entered it themself.
    decidedByUserId: uuid("decided_by_user_id"),
    decidedBy: text("decided_by").notNull().default(""),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionReason: text("decision_reason").notNull().default(""),
    selfDecision: boolean("self_decision").notNull().default(false),
    // Paid: the day the payment went, and who noted it (a note: the bank and the ledger are the accounting system's).
    paidOn: date("paid_on", { mode: "string" }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidByUserId: uuid("paid_by_user_id"),
    paidBy: text("paid_by").notNull().default(""),
    source: text("source").$type<SupplierInvoiceSource>().notNull().default("typed"),
    // The read document, kept as an attachment of a shipment (shipments service; bare ids).
    documentShipmentId: uuid("document_shipment_id"),
    documentAttachmentId: uuid("document_attachment_id"),
    documentName: text("document_name").notNull().default(""),
    // Who entered it (null when it was gathered from lines): they don't approve it while another manager can.
    enteredByUserId: uuid("entered_by_user_id"),
    enteredBy: text("entered_by").notNull().default(""),
    /** The lines as they were when it was refused (they are taken off the jobs) */
    refusedLines: jsonb("refused_lines").$type<RefusedLine[]>().notNull().default([]),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    ...defaultTableIndexes("supplier_invoice", table),
    tenantIndex("supplier_invoice", table),
    // One live invoice per supplier and number; a refused one frees the number for the corrected invoice.
    uniqueIndex("supplier_invoice_supplier_number_unique")
      .on(table.companyId, table.supplierKey, table.numberKey)
      .where(sql`deleted_at IS NULL AND status <> 'refused'`),
    index("supplier_invoice_status_idx").on(table.companyId, table.status, table.dueDate).where(sql`deleted_at IS NULL`),
    index("supplier_invoice_supplier_idx").on(table.companyId, table.supplierCustomerId).where(sql`deleted_at IS NULL AND supplier_customer_id IS NOT NULL`),
    check("supplier_invoice_status_check", sql`${table.status} IN ('booked', 'approved', 'refused')`),
    check("supplier_invoice_kind_check", sql`${table.kind} IN ('invoice', 'credit_note')`),
    check("supplier_invoice_source_check", sql`${table.source} IN ('reading', 'typed', 'master_job', 'backfill')`),
    // Paid only once approved (an older paid line is gathered as approved: it was paid before approval existed).
    check("supplier_invoice_paid_check", sql`${table.paidOn} IS NULL OR ${table.status} = 'approved'`),
    check("supplier_invoice_refused_check", sql`${table.status} <> 'refused' OR ${table.decisionReason} <> ''`),
  ],
);

export type SupplierInvoiceRecord = typeof supplierInvoiceTable.$inferSelect;
export type NewSupplierInvoiceRecord = typeof supplierInvoiceTable.$inferInsert;

export type SupplierInvoiceAction =
  | "booked"
  | "approved"
  | "approval_taken_back"
  | "refused"
  | "paid"
  | "payment_taken_back"
  | "line_changed"
  | "details_changed";

// What happened to a supplier invoice, who did it and why: never changed or deleted.
export const supplierInvoiceEventTable = pgTable(
  "supplier_invoice_event",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    invoiceId: uuid("invoice_id").notNull(),
    action: text("action").$type<SupplierInvoiceAction>().notNull(),
    fromStatus: text("from_status").notNull().default(""),
    toStatus: text("to_status").notNull().default(""),
    byUserId: uuid("by_user_id"),
    by: text("by").notNull().default(""),
    reason: text("reason").notNull().default(""),
    /** What changed (a line's old and new values, a paid day) */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    ...defaultTableIndexes("supplier_invoice_event", table),
    tenantIndex("supplier_invoice_event", table),
    index("supplier_invoice_event_invoice_idx").on(table.invoiceId, table.createdAt),
    foreignKey({ columns: [table.invoiceId], foreignColumns: [supplierInvoiceTable.id], name: "supplier_invoice_event_invoice_fk" }).onDelete("cascade"),
  ],
);

export type SupplierInvoiceEventRecord = typeof supplierInvoiceEventTable.$inferSelect;

// Which booked invoices a user has seen in their bell (an invoice booked on their job).
export const supplierInvoiceSeenTable = pgTable(
  "supplier_invoice_seen",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    userId: uuid("user_id").notNull(),
    invoiceId: uuid("invoice_id").notNull(),
  },
  (table) => [
    ...defaultTableIndexes("supplier_invoice_seen", table),
    tenantIndex("supplier_invoice_seen", table),
    uniqueIndex("supplier_invoice_seen_user_invoice_unique").on(table.companyId, table.userId, table.invoiceId),
    foreignKey({ columns: [table.invoiceId], foreignColumns: [supplierInvoiceTable.id], name: "supplier_invoice_seen_invoice_fk" }).onDelete("cascade"),
  ],
);
