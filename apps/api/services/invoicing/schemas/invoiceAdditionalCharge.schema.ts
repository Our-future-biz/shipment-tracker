import { pgTable, text, numeric, uuid, integer, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";

export const invoiceAdditionalChargeTable = pgTable(
  "invoice_additional_charge",
  {
    ...defaultTableColumns,
    shipmentId: uuid("shipment_id").notNull(),
    invoiceNumber: text("invoice_number").notNull().default(""),
    vendor: text("vendor").notNull().default(""),
    description: text("description").notNull().default(""),
    estAmount: numeric("est_amount", { precision: 14, scale: 2 }),
    estCurrency: text("est_currency").notNull().default("CZK"),
    realAmount: numeric("real_amount", { precision: 14, scale: 2 }),
    realCurrency: text("real_currency").notNull().default("CZK"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    ...defaultTableIndexes("invoice_additional_charge", table),
    index("invoice_additional_charge_shipment_id_idx").on(table.shipmentId),
  ],
);

export type InvoiceAdditionalChargeRecord = typeof invoiceAdditionalChargeTable.$inferSelect;
export type NewInvoiceAdditionalChargeRecord = typeof invoiceAdditionalChargeTable.$inferInsert;
