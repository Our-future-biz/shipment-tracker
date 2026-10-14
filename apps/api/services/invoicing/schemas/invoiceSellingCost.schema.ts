import { pgTable, text, numeric, uuid, integer, boolean, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

/**
 * Selling costs of the Costs Breakdown (mockup: table #sellTable).
 * Columns: Category | Customer | Qty | Amount | Cur | Total in CZK | Invoice.
 * "Total in CZK" isn't stored: it's derived from the exchange rate of the ETA/ETD date.
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
    /** include in the billing calculation sheet (mockup: ticked by default) */
    invoice: boolean("invoice").notNull().default(true),
    /** the buying row it was copied from (mockup: data-src) — prevents copying it twice */
    sourceBuyId: uuid("source_buy_id"),
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
