import { sql } from "drizzle-orm";
import { pgTable, text, numeric, uuid, timestamp, boolean, date, index, uniqueIndex, check, jsonb } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { invoiceTable } from "./invoice.schema";

export type InvoiceChangeRequestStatus = "pending" | "approved" | "rejected" | "withdrawn" | "expired";

/** What the one asking says is wrong with the invoice (shown to the manager; corrected after approval). */
export const INVOICE_FIXES = ["lines", "customer", "duzp", "currency", "text", "other"] as const;
export type InvoiceFix = (typeof INVOICE_FIXES)[number];

// A request to change an invoice on the day it was issued (owner's decision, 17 Nov 2026): asked from
// the invoice with what is wrong and why, answered by a manager on Sales → Managers → Billing
// approvals the same day. Approving cancels the invoice (kept on record, no credit note): its lines are
// billed again, corrected, under the next number. A request still waiting at midnight (Prague) expires;
// after that only a credit note corrects the invoice. Never written over: a new request is a new row.
export const invoiceChangeRequestTable = pgTable(
  "invoice_change_request",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    // The job, invoice and customer as they were named when asked.
    jobNumber: text("job_number").notNull().default(""),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoiceTable.id),
    invoiceNumber: text("invoice_number").notNull(),
    customerName: text("customer_name").notNull().default(""),
    currency: text("currency").notNull(),
    gross: numeric("gross", { precision: 14, scale: 2 }).notNull(),
    // The invoice's issue date: the request can be answered only on it.
    issueDate: date("issue_date").notNull(),
    fixes: jsonb("fixes").$type<InvoiceFix[]>().notNull(),
    reason: text("reason").notNull(),
    status: text("status").$type<InvoiceChangeRequestStatus>().notNull().default("pending"),
    requestedById: uuid("requested_by_id").notNull(),
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
  },
  (table) => [
    ...defaultTableIndexes("invoice_change_request", table),
    tenantIndex("invoice_change_request", table),
    index("invoice_change_request_company_status_idx").on(table.companyId, table.status, table.requestedAt),
    index("invoice_change_request_company_shipment_idx").on(table.companyId, table.shipmentId),
    // One request waits per invoice.
    uniqueIndex("invoice_change_request_pending_unique").on(table.invoiceId).where(sql`status = 'pending' AND deleted_at IS NULL`),
    check("invoice_change_request_status_check", sql`${table.status} IN ('pending', 'approved', 'rejected', 'withdrawn', 'expired')`),
  ],
);

export type InvoiceChangeRequestRecord = typeof invoiceChangeRequestTable.$inferSelect;
export type NewInvoiceChangeRequestRecord = typeof invoiceChangeRequestTable.$inferInsert;
