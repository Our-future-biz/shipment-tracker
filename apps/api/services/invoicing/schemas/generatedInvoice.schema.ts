import { pgTable, text, numeric, uuid, uniqueIndex, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export const generatedInvoiceTable = pgTable(
  "generated_invoice",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    invoiceNumber: text("invoice_number").notNull(),
    invoiceType: text("invoice_type").notNull(),
    billingCurrency: text("billing_currency").notNull(),
    totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
  },
  (table) => [
    ...defaultTableIndexes("generated_invoice", table),
    tenantIndex("generated_invoice", table),
    index("generated_invoice_shipment_id_idx").on(table.shipmentId),
    // Invoice numbers derive from per-company job numbers, so they're unique per company
    // (kept across soft-delete — a legal invoice number is never reused).
    uniqueIndex("generated_invoice_company_number_unique").on(table.companyId, table.invoiceNumber),
  ],
);

export type GeneratedInvoiceRecord = typeof generatedInvoiceTable.$inferSelect;
export type NewGeneratedInvoiceRecord = typeof generatedInvoiceTable.$inferInsert;
