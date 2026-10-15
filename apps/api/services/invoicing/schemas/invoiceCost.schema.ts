import { sql } from "drizzle-orm";
import { pgTable, text, numeric, uuid, integer, boolean, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export const invoiceCostTable = pgTable(
  "invoice_cost",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    /** The charge code (apps/api/lib/chargeCodes.ts), e.g. "road_freight"; older rows may hold text typed before the catalogue. */
    category: text("category").notNull().default(""),
    /** What the cost is for, in words - the category alone cannot tell two lines of one kind apart. */
    description: text("description").notNull().default(""),
    /** Estimated buying costs (mockup: Qty | Est. Amount | Cur) */
    estQty: numeric("est_qty", { precision: 14, scale: 2 }),
    estAmount: numeric("est_amount", { precision: 14, scale: 2 }),
    estCurrency: text("est_currency").notNull().default("CZK"),
    /** Real buying costs (mockup: Qty | Real Cost | Cur | Invoice number | Received) */
    realQty: numeric("real_qty", { precision: 14, scale: 2 }),
    realAmount: numeric("real_amount", { precision: 14, scale: 2 }),
    realCurrency: text("real_currency").notNull().default("CZK"),
    /** What the quantity counts ("km", "pallet", "hour"); "" = a charge counted as a whole. */
    unit: text("unit").notNull().default(""),
    invoiceNumber: text("invoice_number").notNull().default(""),
    /** the vendor's invoice has been received */
    received: boolean("received").notNull().default(false),
    vendor: text("vendor").notNull().default(""),
    /** The haulier the cost is owed to: a company of the Customer Database (no FK - another service's database). */
    haulierId: uuid("haulier_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    /** The sales quote the row was copied from; "" for a row entered by hand. Tells whether a quote was already copied. */
    sourceQuoteNumber: text("source_quote_number").notNull().default(""),
    /**
     * The Trucking consignment (sell, "trucking:consignment:<id>") or trip (buy, "trucking:trip:<id>")
     * the row was pushed from; null for any other row. Such rows are kept by Trucking (replaced as a
     * set) and read-only in Costs Breakdown.
     */
    sourceTruckingRef: text("source_trucking_ref"),
  },
  (table) => [
    ...defaultTableIndexes("invoice_cost", table),
    tenantIndex("invoice_cost", table),
    index("invoice_cost_shipment_id_idx").on(table.shipmentId),
    index("invoice_cost_trucking_ref_idx").on(table.companyId, table.sourceTruckingRef).where(sql`source_trucking_ref IS NOT NULL`),
  ],
);

export type InvoiceCostRecord = typeof invoiceCostTable.$inferSelect;
export type NewInvoiceCostRecord = typeof invoiceCostTable.$inferInsert;
