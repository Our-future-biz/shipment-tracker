import { pgTable, text, uuid, real, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";
import { customerTable } from "./customer.schema";

export const customerInvoiceTable = pgTable(
  "customer_invoice",
  {
    ...defaultTableColumns,
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customerTable.id, { onDelete: "cascade" }),
    invoiceNumber: text("invoice_number").notNull(),
    amount: real("amount").notNull().default(0),
    dueDate: text("due_date").notNull().default(""),
    status: text("status").notNull().default("Open"), // Open / Overdue / Paid
    issuedAt: text("issued_at").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("customer_invoice", table),
    index("customer_invoice_customer_id_idx").on(table.customerId),
  ],
);

export type CustomerInvoiceRecord = typeof customerInvoiceTable.$inferSelect;
export type NewCustomerInvoiceRecord = typeof customerInvoiceTable.$inferInsert;
