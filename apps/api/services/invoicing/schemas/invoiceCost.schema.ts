import { pgTable, text, numeric, uuid, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";

export const invoiceCostTable = pgTable(
  "invoice_cost",
  {
    ...defaultTableColumns,
    shipmentId: uuid("shipment_id").notNull(),
    category: text("category").notNull(),
    estAmount: numeric("est_amount", { precision: 14, scale: 2 }),
    estCurrency: text("est_currency").notNull().default("CZK"),
    realAmount: numeric("real_amount", { precision: 14, scale: 2 }),
    realCurrency: text("real_currency").notNull().default("CZK"),
    invoiceNumber: text("invoice_number").notNull().default(""),
    vendor: text("vendor").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("invoice_cost", table),
    index("invoice_cost_shipment_id_idx").on(table.shipmentId),
  ],
);

export type InvoiceCostRecord = typeof invoiceCostTable.$inferSelect;
export type NewInvoiceCostRecord = typeof invoiceCostTable.$inferInsert;
