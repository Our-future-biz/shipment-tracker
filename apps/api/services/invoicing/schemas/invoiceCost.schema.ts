import { pgTable, text, numeric, uuid, integer, boolean, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export const invoiceCostTable = pgTable(
  "invoice_cost",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    category: text("category").notNull().default(""),
    /** Estimated buying costs (mockup: Qty | Est. Amount | Cur) */
    estQty: numeric("est_qty", { precision: 14, scale: 2 }),
    estAmount: numeric("est_amount", { precision: 14, scale: 2 }),
    estCurrency: text("est_currency").notNull().default("CZK"),
    /** Real buying costs (mockup: Qty | Real Cost | Cur | Invoice number | Received) */
    realQty: numeric("real_qty", { precision: 14, scale: 2 }),
    realAmount: numeric("real_amount", { precision: 14, scale: 2 }),
    realCurrency: text("real_currency").notNull().default("CZK"),
    invoiceNumber: text("invoice_number").notNull().default(""),
    /** prijata faktura obdrzena */
    received: boolean("received").notNull().default(false),
    vendor: text("vendor").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    ...defaultTableIndexes("invoice_cost", table),
    tenantIndex("invoice_cost", table),
    index("invoice_cost_shipment_id_idx").on(table.shipmentId),
  ],
);

export type InvoiceCostRecord = typeof invoiceCostTable.$inferSelect;
export type NewInvoiceCostRecord = typeof invoiceCostTable.$inferInsert;
