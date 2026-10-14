import { pgTable, text, uuid, integer, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { shipmentTable } from "./shipment.schema";

// One commercial invoice of a shipment: its number, value and currency. The
// shipment's Commercial Invoice number(s) / value are read from these rows.
export const commercialInvoiceTable = pgTable(
  "commercial_invoice",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull().references(() => shipmentTable.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    invoiceNumber: text("invoice_number").notNull().default(""),
    value: text("value").notNull().default(""),
    currency: text("currency").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("commercial_invoice", table),
    tenantIndex("commercial_invoice", table),
    index("commercial_invoice_shipment_id_idx").on(table.shipmentId),
  ],
);

export type CommercialInvoiceRecord = typeof commercialInvoiceTable.$inferSelect;
export type NewCommercialInvoiceRecord = typeof commercialInvoiceTable.$inferInsert;
