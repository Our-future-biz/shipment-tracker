import { sql } from "drizzle-orm";
import { pgTable, text, uuid, numeric, date, index, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { customerTable } from "./customer.schema";
import type { InvoiceSource, InvoiceStatus } from "../interfaces/interfaces";

export const customerInvoiceTable = pgTable(
  "customer_invoice",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customerTable.id, { onDelete: "cascade" }),
    invoiceNumber: text("invoice_number").notNull(),
    // Money as numeric (exact); mode:"number" keeps the API type a JS number.
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    // Currency the customer pays in; the CZK equivalent is on the invoice itself.
    currency: text("currency").notNull().default("CZK"),
    dueDate: date("due_date", { mode: "string" }),
    status: text("status").$type<InvoiceStatus>().notNull().default("Open"),
    issuedAt: date("issued_at", { mode: "string" }),
    // Typed in here, or posted by Invoicing (an issued invoice or credit note, its id in invoice_id). A posted one
    // is changed only by a credit note, and its payments are noted on Finance → Accounts Receivable.
    source: text("source").$type<InvoiceSource>().notNull().default("typed"),
    invoiceId: uuid("invoice_id"),
    // What Accounts Receivable says is left to pay (the invoice less its credit notes and payments; 0 on a partial
    // credit note, netted into its invoice) and the day of its last payment. Null until it is sent: the amount counts.
    leftToPay: numeric("left_to_pay", { precision: 14, scale: 2, mode: "number" }),
    paidOn: date("paid_on", { mode: "string" }),
  },
  (table) => [
    ...defaultTableIndexes("customer_invoice", table),
    tenantIndex("customer_invoice", table),
    index("customer_invoice_customer_id_idx").on(table.customerId),
    index("customer_invoice_status_idx").on(table.status),
    index("customer_invoice_invoice_id_idx").on(table.companyId, table.invoiceId),
    check("customer_invoice_status_check", sql`${table.status} IN ('Open', 'Overdue', 'Paid', 'Credited', 'Cancelled')`),
    check("customer_invoice_source_check", sql`${table.source} IN ('typed', 'invoicing')`),
  ],
);

export type CustomerInvoiceRecord = typeof customerInvoiceTable.$inferSelect;
export type NewCustomerInvoiceRecord = typeof customerInvoiceTable.$inferInsert;
