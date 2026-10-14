import { sql } from "drizzle-orm";
import { pgTable, text, uuid, numeric, date, index, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { customerTable } from "./customer.schema";
import type { InvoiceStatus } from "../interfaces/interfaces";

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
    dueDate: date("due_date", { mode: "string" }),
    status: text("status").$type<InvoiceStatus>().notNull().default("Open"),
    issuedAt: date("issued_at", { mode: "string" }),
  },
  (table) => [
    ...defaultTableIndexes("customer_invoice", table),
    tenantIndex("customer_invoice", table),
    index("customer_invoice_customer_id_idx").on(table.customerId),
    index("customer_invoice_status_idx").on(table.status),
    check("customer_invoice_status_check", sql`${table.status} IN ('Open', 'Overdue', 'Paid')`),
  ],
);

export type CustomerInvoiceRecord = typeof customerInvoiceTable.$inferSelect;
export type NewCustomerInvoiceRecord = typeof customerInvoiceTable.$inferInsert;
