import { sql } from "drizzle-orm";
import { pgTable, text, numeric, uuid, integer, smallint, boolean, date, timestamp, jsonb, index, uniqueIndex, check, foreignKey } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { invoiceTable } from "./invoice.schema";

// Finance → Accounts Receivable (Council Outlay 10, 18 Nov 2026). The issued invoice stays the truth and is never
// written to (a trigger locks it, migrations 0011 and 0034): what the customer paid, the chasing and the history are
// records of their own that point to it. One receivable per invoice of kind 'invoice', made when it is first read.

/**
 * payment: money the customer paid; carried_over: "Paid" from the customer's list before Accounts Receivable (D15);
 * write_off / bank_charge (step 7, D13): what is left closed by a manager with a reason, counted only once a second
 * manager confirms it (or, with no other manager in the company, the same one, marked as a self-confirmation).
 */
export type ReceivablePaymentKind = "payment" | "carried_over" | "write_off" | "bank_charge";
export type ReceivableNoteKind = "note" | "promise" | "dispute" | "dispute_closed" | "reminder";

/** One per invoice: what is paid so far, the chasing state and a version, so two managers can't note the same payment twice. */
export const receivableTable = pgTable(
  "receivable",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    invoiceId: uuid("invoice_id").notNull(),
    // Kept in step with the live payments by every write (the list sums the payments themselves).
    paidTotal: numeric("paid_total", { precision: 14, scale: 2 }).notNull().default("0"),
    lastPaidOn: date("last_paid_on", { mode: "string" }),
    /** The day the customer promised to pay by (a promise note) */
    promisedOn: date("promised_on", { mode: "string" }),
    disputed: boolean("disputed").notNull().default(false),
    disputedReason: text("disputed_reason").notNull().default(""),
    /** The last reminder recorded: 0 none, 1 and 2, 3 the final notice */
    reminderLevel: smallint("reminder_level").notNull().default(0),
    lastRemindedOn: date("last_reminded_on", { mode: "string" }),
    /** Whether the customer's list was asked if it says Paid (carried over once, D15) */
    carriedChecked: boolean("carried_checked").notNull().default(false),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    ...defaultTableIndexes("receivable", table),
    tenantIndex("receivable", table),
    uniqueIndex("receivable_invoice_unique").on(table.invoiceId),
    foreignKey({ columns: [table.invoiceId], foreignColumns: [invoiceTable.id], name: "receivable_invoice_fk" }),
    check("receivable_reminder_level_check", sql`${table.reminderLevel} BETWEEN 0 AND 3`),
  ],
);

export type ReceivableRecord = typeof receivableTable.$inferSelect;
export type NewReceivableRecord = typeof receivableTable.$inferInsert;

// A payment the customer made, as a manager noted it from the bank or the accounting system (D11, D12): its day and
// amount in the invoice's currency. Never deleted: taken back with who, when and why.
export const receivablePaymentTable = pgTable(
  "receivable_payment",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    invoiceId: uuid("invoice_id").notNull(),
    kind: text("kind").$type<ReceivablePaymentKind>().notNull().default("payment"),
    /** The day it was paid; null only for one carried over ("Paid before Accounts Receivable, day not known") */
    paidOn: date("paid_on", { mode: "string" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    note: text("note").notNull().default(""),
    byUserId: uuid("by_user_id"),
    by: text("by").notNull().default(""),
    /** The same key twice (a double click, a retry) notes one payment */
    idempotencyKey: text("idempotency_key"),
    takenBackAt: timestamp("taken_back_at", { withTimezone: true }),
    takenBackByUserId: uuid("taken_back_by_user_id"),
    takenBackBy: text("taken_back_by").notNull().default(""),
    takenBackReason: text("taken_back_reason").notNull().default(""),
    /** Why a write-off or a bank charge closes what is left (required for those two) */
    reason: text("reason").notNull().default(""),
    /** One bank payment over several invoices: the same reference on each of its lines (step 7) */
    bankRef: text("bank_ref").notNull().default(""),
    /** When it counts: at once for a payment; for a write-off or bank charge when a second manager confirms it */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedByUserId: uuid("confirmed_by_user_id"),
    confirmedBy: text("confirmed_by").notNull().default(""),
    /** Confirmed by the manager who wrote it, because the company has no other manager */
    selfConfirmed: boolean("self_confirmed").notNull().default(false),
  },
  (table) => [
    ...defaultTableIndexes("receivable_payment", table),
    tenantIndex("receivable_payment", table),
    index("receivable_payment_invoice_idx").on(table.invoiceId, table.createdAt),
    uniqueIndex("receivable_payment_idempotency_unique").on(table.companyId, table.idempotencyKey).where(sql`idempotency_key IS NOT NULL`),
    // Carried over once per invoice.
    uniqueIndex("receivable_payment_carried_unique").on(table.invoiceId).where(sql`kind = 'carried_over'`),
    // A write-off or bank charge waiting for a second manager.
    index("receivable_payment_waiting_idx").on(table.companyId, table.createdAt).where(sql`confirmed_at IS NULL AND taken_back_at IS NULL`),
    foreignKey({ columns: [table.invoiceId], foreignColumns: [invoiceTable.id], name: "receivable_payment_invoice_fk" }),
    check("receivable_payment_kind_check", sql`${table.kind} IN ('payment', 'carried_over', 'write_off', 'bank_charge')`),
    check("receivable_payment_reason_check", sql`${table.kind} NOT IN ('write_off', 'bank_charge') OR ${table.reason} <> ''`),
    check("receivable_payment_confirmed_check", sql`${table.kind} IN ('write_off', 'bank_charge') OR ${table.confirmedAt} IS NOT NULL`),
    check("receivable_payment_amount_check", sql`${table.amount} > 0`),
    check("receivable_payment_paid_on_check", sql`${table.paidOn} IS NOT NULL OR ${table.kind} = 'carried_over'`),
  ],
);

export type ReceivablePaymentRecord = typeof receivablePaymentTable.$inferSelect;
export type NewReceivablePaymentRecord = typeof receivablePaymentTable.$inferInsert;

// The chasing (D16, D17): a note, a promised day, a dispute and its end, a reminder sent from the user's own mail
// program (the app sends nothing). Never changed.
export const receivableNoteTable = pgTable(
  "receivable_note",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    invoiceId: uuid("invoice_id").notNull(),
    kind: text("kind").$type<ReceivableNoteKind>().notNull(),
    text: text("text").notNull().default(""),
    promisedOn: date("promised_on", { mode: "string" }),
    reminderLevel: smallint("reminder_level"),
    /** Who a reminder went to (an e-mail) */
    recipient: text("recipient").notNull().default(""),
    byUserId: uuid("by_user_id"),
    by: text("by").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("receivable_note", table),
    tenantIndex("receivable_note", table),
    index("receivable_note_invoice_idx").on(table.invoiceId, table.createdAt),
    foreignKey({ columns: [table.invoiceId], foreignColumns: [invoiceTable.id], name: "receivable_note_invoice_fk" }),
    check("receivable_note_kind_check", sql`${table.kind} IN ('note', 'promise', 'dispute', 'dispute_closed', 'reminder')`),
    check("receivable_note_reminder_check", sql`${table.kind} <> 'reminder' OR ${table.reminderLevel} BETWEEN 1 AND 3`),
  ],
);

export type ReceivableNoteRecord = typeof receivableNoteTable.$inferSelect;

export type ReceivableAction =
  | "payment_noted"
  | "payment_taken_back"
  | "carried_over"
  | "note_added"
  | "promised"
  | "disputed"
  | "dispute_closed"
  | "reminded"
  | "sent_again"
  // Step 7 (D13): a write-off or bank charge written, confirmed by a second manager, taken back.
  | "write_off_noted"
  | "write_off_confirmed"
  | "write_off_taken_back";

// What happened to an invoice's receivable, who did it and why: never changed or deleted (the shape of supplier_invoice_event).
export const receivableEventTable = pgTable(
  "receivable_event",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    invoiceId: uuid("invoice_id").notNull(),
    action: text("action").$type<ReceivableAction>().notNull(),
    fromStatus: text("from_status").notNull().default(""),
    toStatus: text("to_status").notNull().default(""),
    byUserId: uuid("by_user_id"),
    by: text("by").notNull().default(""),
    reason: text("reason").notNull().default(""),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [
    ...defaultTableIndexes("receivable_event", table),
    tenantIndex("receivable_event", table),
    index("receivable_event_invoice_idx").on(table.invoiceId, table.createdAt),
    foreignKey({ columns: [table.invoiceId], foreignColumns: [invoiceTable.id], name: "receivable_event_invoice_fk" }),
  ],
);

export type ReceivableEventRecord = typeof receivableEventTable.$inferSelect;

// Which bell notices a user has seen (D18): one per invoice and milestone (overdue_1, overdue_14, overdue_30, paid).
export const receivableSeenTable = pgTable(
  "receivable_seen",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    userId: uuid("user_id").notNull(),
    invoiceId: uuid("invoice_id").notNull(),
    milestone: text("milestone").notNull(),
  },
  (table) => [
    ...defaultTableIndexes("receivable_seen", table),
    tenantIndex("receivable_seen", table),
    uniqueIndex("receivable_seen_unique").on(table.companyId, table.userId, table.invoiceId, table.milestone),
    foreignKey({ columns: [table.invoiceId], foreignColumns: [invoiceTable.id], name: "receivable_seen_invoice_fk" }),
  ],
);

// The company's reminder settings (step 7): automatic reminders 1 and 2 at so many days overdue, sent only while
// e-mail from the app is switched on (lib/email emailConfigured); the final notice stays a manager's own act (D17).
export const receivableSettingsTable = pgTable(
  "receivable_settings",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    autoReminders: boolean("auto_reminders").notNull().default(false),
    reminder1Days: smallint("reminder1_days").notNull().default(7),
    reminder2Days: smallint("reminder2_days").notNull().default(21),
    /** Where a customer's answer goes; "" = the sender's own address */
    replyTo: text("reply_to").notNull().default(""),
    updatedByUserId: uuid("updated_by_user_id"),
    updatedBy: text("updated_by").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("receivable_settings", table),
    uniqueIndex("receivable_settings_company_unique").on(table.companyId),
    check(
      "receivable_settings_days_check",
      sql`${table.reminder1Days} BETWEEN 1 AND 365 AND ${table.reminder2Days} > ${table.reminder1Days} AND ${table.reminder2Days} <= 365`,
    ),
  ],
);

export type ReceivableSettingsRecord = typeof receivableSettingsTable.$inferSelect;

export type ReceivableMailKind = "reminder" | "statement";
export type ReceivableMailStatus = "sent" | "failed";

// What the app e-mailed to a customer (step 7): a reminder of an invoice or a statement of what the customer owes in a
// currency. Only real attempts are written (nothing while e-mail is switched off); a reminder sent is also a reminder
// note on the invoice (receivable_note), so the chasing reads the same whether it was sent by hand or by the app.
export const receivableMailTable = pgTable(
  "receivable_mail",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    kind: text("kind").$type<ReceivableMailKind>().notNull(),
    /** The invoice of a reminder; null for a statement */
    invoiceId: uuid("invoice_id"),
    customerId: uuid("customer_id").notNull(),
    /** A statement's currency */
    currency: text("currency").notNull().default(""),
    reminderLevel: smallint("reminder_level"),
    recipient: text("recipient").notNull().default(""),
    /** cs | en: the customer's language the text was written in */
    language: text("language").notNull().default("en"),
    status: text("status").$type<ReceivableMailStatus>().notNull(),
    providerId: text("provider_id").notNull().default(""),
    error: text("error").notNull().default(""),
    /** Sent by the daily run, not by a person */
    automatic: boolean("automatic").notNull().default(false),
    byUserId: uuid("by_user_id"),
    by: text("by").notNull().default(""),
    /** The same key twice (a repeated run, a double click) sends one mail */
    idempotencyKey: text("idempotency_key"),
  },
  (table) => [
    ...defaultTableIndexes("receivable_mail", table),
    index("receivable_mail_invoice_idx").on(table.invoiceId, table.createdAt),
    index("receivable_mail_customer_idx").on(table.companyId, table.customerId, table.createdAt),
    uniqueIndex("receivable_mail_idempotency_unique").on(table.companyId, table.idempotencyKey).where(sql`idempotency_key IS NOT NULL`),
    foreignKey({ columns: [table.invoiceId], foreignColumns: [invoiceTable.id], name: "receivable_mail_invoice_fk" }),
    check("receivable_mail_kind_check", sql`${table.kind} IN ('reminder', 'statement')`),
    check("receivable_mail_status_check", sql`${table.status} IN ('sent', 'failed')`),
  ],
);

export type ReceivableMailRecord = typeof receivableMailTable.$inferSelect;
