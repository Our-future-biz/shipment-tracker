import { sql } from "drizzle-orm";
import { pgTable, text, numeric, uuid, timestamp, boolean, index, uniqueIndex, check, jsonb } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { invoiceTable } from "./invoice.schema";

export type CreditNoteRequestStatus = "pending" | "approved" | "rejected" | "withdrawn";

/** One line asked to be credited: the invoice line, and what of it, in its own currency. */
export interface CreditNoteRequestLine {
  lineId: string;
  description: string;
  unitCurrency: string;
  /** What to credit, in the line's own currency */
  amount: string;
  /** The same in the invoice currency, when asked */
  net: string;
}

// A request to credit an invoice in part (owner's decision, 17 Nov 2026): asked from the invoice
// with a reason, answered by a manager on Sales → Managers → Billing approvals. Approving issues the
// credit note; nothing changes before. A row is never written over - a new request is a new row - so
// every ask and answer stays on record.
export const creditNoteRequestTable = pgTable(
  "credit_note_request",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    // The job, invoice and customer as they were named when asked: the managers' list reads them without asking other services.
    jobNumber: text("job_number").notNull().default(""),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoiceTable.id),
    invoiceNumber: text("invoice_number").notNull(),
    customerName: text("customer_name").notNull().default(""),
    currency: text("currency").notNull(),
    lines: jsonb("lines").$type<CreditNoteRequestLine[]>().notNull(),
    // What the credit note comes to, in the invoice currency, when asked (positive).
    net: numeric("net", { precision: 14, scale: 2 }).notNull(),
    vat: numeric("vat", { precision: 14, scale: 2 }).notNull(),
    gross: numeric("gross", { precision: 14, scale: 2 }).notNull(),
    // The invoice's gross, to show what part of it is asked.
    invoiceGross: numeric("invoice_gross", { precision: 14, scale: 2 }).notNull(),
    reason: text("reason").notNull(),
    status: text("status").$type<CreditNoteRequestStatus>().notNull().default("pending"),
    requestedById: uuid("requested_by_id").notNull(),
    // Who asked and who answered (or took it back) by e-mail as recorded then: they stay named when they leave.
    requestedByName: text("requested_by_name").notNull().default(""),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decidedById: uuid("decided_by_id"),
    decidedByName: text("decided_by_name").notNull().default(""),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    comment: text("comment").notNull().default(""),
    // The manager who answered is the one who asked (allowed and shown, as on the other approvals).
    selfDecision: boolean("self_decision").notNull().default(false),
    // When the one who asked opened the answer in the bell.
    answerSeenAt: timestamp("answer_seen_at", { withTimezone: true }),
    // The credit note the approval issued.
    creditNoteId: uuid("credit_note_id"),
    creditNoteNumber: text("credit_note_number").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("credit_note_request", table),
    tenantIndex("credit_note_request", table),
    index("credit_note_request_company_status_idx").on(table.companyId, table.status, table.requestedAt),
    index("credit_note_request_company_shipment_idx").on(table.companyId, table.shipmentId),
    // One request waits per invoice; a second one is refused until it is answered.
    uniqueIndex("credit_note_request_pending_unique").on(table.invoiceId).where(sql`status = 'pending' AND deleted_at IS NULL`),
    check("credit_note_request_status_check", sql`${table.status} IN ('pending', 'approved', 'rejected', 'withdrawn')`),
  ],
);

export type CreditNoteRequestRecord = typeof creditNoteRequestTable.$inferSelect;
export type NewCreditNoteRequestRecord = typeof creditNoteRequestTable.$inferInsert;
