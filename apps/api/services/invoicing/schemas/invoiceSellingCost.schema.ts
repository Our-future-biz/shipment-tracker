import { pgTable, text, numeric, uuid, integer, boolean, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

/**
 * Selling costs z Costs Breakdownu (mockup: tabulka #sellTable).
 * Sloupce dle mockupu: Category | Customer | Qty | Amount | Cur | Total in CZK | Invoice
 * "Total in CZK" se nepocita v DB - je to odvozena hodnota dle kurzu k datu ETA/ETD.
 */
export const invoiceSellingCostTable = pgTable(
  "invoice_selling_cost",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    category: text("category").notNull().default(""),
    customer: text("customer").notNull().default(""),
    qty: numeric("qty", { precision: 14, scale: 2 }),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    currency: text("currency").notNull().default("CZK"),
    /** zahrnout do kalkulacniho listu k fakturaci */
    invoice: boolean("invoice").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    ...defaultTableIndexes("invoice_selling_cost", table),
    tenantIndex("invoice_selling_cost", table),
    index("invoice_selling_cost_shipment_id_idx").on(table.shipmentId),
  ],
);

export type InvoiceSellingCostRecord = typeof invoiceSellingCostTable.$inferSelect;
export type NewInvoiceSellingCostRecord = typeof invoiceSellingCostTable.$inferInsert;
