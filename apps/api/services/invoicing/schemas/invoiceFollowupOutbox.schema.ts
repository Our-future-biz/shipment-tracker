import { sql } from "drizzle-orm";
import { pgTable, uuid, text, jsonb, index, foreignKey, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { outboxColumns, outboxStatusCheck } from "../../../lib/outbox/outbox.columns";
import { invoiceTable } from "./invoice.schema";

/**
 * What an issued document owes the other services, each a row of its own:
 * - customer_invoice: the document in the customer's invoice list (aging, credit facts);
 * - mark_credited: the invoice a credit note cancels marked Credited there too;
 * - status_after_issue / status_after_credit: the shipment's Shipment and Invoicing Status
 *   (lib/shipmentStatus), worked out from the shipment as it is when the row is sent; also owed by a
 *   selling line that became or stopped being a charge after invoicing, under the job's newest open
 *   invoice (the row needs one: a job with none has nothing invoiced to move back from);
 * - receivable_state: what is left to pay on an invoice (Finance → Accounts Receivable), read fresh when the
 *   row is sent, on the invoice's row in the customer's list.
 */
export type InvoiceFollowupKind = "customer_invoice" | "mark_credited" | "status_after_issue" | "status_after_credit" | "receivable_state";

export type InvoiceFollowupPayload =
  // customer_invoice: invoiceId is the document's own id (absent on rows written before 18 Nov 2026)
  | { customerId: string; invoiceNumber: string; amount: number; currency: string; dueDate: string; status: "Open" | "Credited"; issuedAt: string; invoiceId?: string }
  // mark_credited: Cancelled for an invoice cancelled on its issue day; Credited when left out
  | { invoiceNumbers: string[]; status?: "Cancelled" }
  // status_after_issue / status_after_credit: `charge` names the selling line whose change made the row (a charge
  // added or taken away after invoicing: services/invoiceFollowups followupsOfSellingChange); absent after a document
  | { shipmentId: string; charge?: string }
  // receivable_state: the invoice (never a credit note)
  | { invoiceId: string };

// The follow-ups of an issued invoice or credit note, written in the issue's own transaction and
// sent after the commit (straight away, then by the invoicing-followups cron with retries): a
// document that rolls back owes nothing, and a committed one is never left out of the customer's
// list or the shipment's statuses because a service did not answer at that moment.
export const invoiceFollowupOutboxTable = pgTable(
  "invoice_followup_outbox",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    invoiceId: uuid("invoice_id").notNull(),
    // The shipment the document bills: one shipment's follow-ups go out in the order they were made
    // (an invoice's statuses before those of the credit note that cancels it).
    shipmentId: uuid("shipment_id").notNull(),
    kind: text("kind").$type<InvoiceFollowupKind>().notNull(),
    payload: jsonb("payload").$type<InvoiceFollowupPayload>().notNull(),
    // Acting user, status, attempts, next try, claim and last error (shared with other outboxes).
    ...outboxColumns,
  },
  (table) => [
    ...defaultTableIndexes("invoice_followup_outbox", table),
    tenantIndex("invoice_followup_outbox", table),
    index("invoice_followup_outbox_due_idx").on(table.nextAttemptAt).where(sql`status = 'pending'`),
    index("invoice_followup_outbox_invoice_idx").on(table.invoiceId, table.createdAt),
    index("invoice_followup_outbox_shipment_idx").on(table.shipmentId, table.createdAt),
    foreignKey({ name: "invoice_followup_outbox_invoice_fk", columns: [table.invoiceId], foreignColumns: [invoiceTable.id] }).onDelete("cascade"),
    check("invoice_followup_outbox_kind_check", sql`${table.kind} IN ('customer_invoice', 'mark_credited', 'status_after_issue', 'status_after_credit', 'receivable_state')`),
    outboxStatusCheck("invoice_followup_outbox_status_check", table),
  ],
);

export type InvoiceFollowupOutboxRecord = typeof invoiceFollowupOutboxTable.$inferSelect;
export type NewInvoiceFollowupOutboxRecord = typeof invoiceFollowupOutboxTable.$inferInsert;
