import { pgTable, text, numeric, uuid, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";

export const generatedInvoiceTable = pgTable(
  "generated_invoice",
  {
    ...defaultTableColumns,
    shipmentId: uuid("shipment_id").notNull(),
    invoiceNumber: text("invoice_number").notNull().unique(),
    invoiceType: text("invoice_type").notNull(),
    billingCurrency: text("billing_currency").notNull(),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
  },
  (table) => [
    ...defaultTableIndexes("generated_invoice", table),
    index("generated_invoice_shipment_id_idx").on(table.shipmentId),
    index("generated_invoice_invoice_number_idx").on(table.invoiceNumber),
  ],
);

export type GeneratedInvoiceRecord = typeof generatedInvoiceTable.$inferSelect;
export type NewGeneratedInvoiceRecord = typeof generatedInvoiceTable.$inferInsert;
