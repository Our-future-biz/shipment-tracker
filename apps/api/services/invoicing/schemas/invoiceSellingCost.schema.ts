import { sql } from "drizzle-orm";
import { pgTable, text, numeric, uuid, integer, boolean, index, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import type { SellingVatCode } from "../interfaces/interfaces";

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
    /** What is charged, in words (from the quote) - the category alone cannot tell two lines of one kind apart. */
    description: text("description").notNull().default(""),
    /** The "Invoice text" column: the line text printed on the invoice; empty = the category. (Column name from the mockup.) */
    customer: text("customer").notNull().default(""),
    qty: numeric("qty", { precision: 14, scale: 2 }),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    currency: text("currency").notNull().default("CZK"),
    /** include in the billing calculation sheet (mockup: ticked by default) */
    invoice: boolean("invoice").notNull().default(true),
    /** the buying row it was copied from (mockup: data-src) — prevents copying it twice */
    sourceBuyId: uuid("source_buy_id"),
    /** VAT code of the line on the invoice; null = the default by the shipment's trade direction */
    vatCode: text("vat_code").$type<SellingVatCode>(),
    sortOrder: integer("sort_order").notNull().default(0),
    /** The sales quote the row was copied from; "" for a row entered by hand. Tells whether a quote was already copied. */
    sourceQuoteNumber: text("source_quote_number").notNull().default(""),
    /**
     * The Trucking consignment (sell, "trucking:consignment:<id>") or trip (buy, "trucking:trip:<id>")
     * the row was pushed from; null for any other row. Such rows are kept by Trucking (replaced as a
     * set) and read-only in Costs Breakdown.
     */
    sourceTruckingRef: text("source_trucking_ref"),
    /**
     * The master job's line the row sells on at cost ("master:<masterJobId>:<lineId>", as on the
     * buying share); null for any other row. Kept by the master job's split and read-only in Costs Breakdown.
     */
    sourceMasterJobRef: text("source_master_job_ref"),
    /**
     * A row the split keeps, with a number of its own: what the share cost when the number was set
     * (a person raised it, or a manager approved it lower). Null = it follows the cost.
     */
    amountOverrideCost: numeric("amount_override_cost", { precision: 14, scale: 2 }),
  },
  (table) => [
    ...defaultTableIndexes("invoice_selling_cost", table),
    tenantIndex("invoice_selling_cost", table),
    index("invoice_selling_cost_shipment_id_idx").on(table.shipmentId),
    index("invoice_selling_cost_trucking_ref_idx").on(table.companyId, table.sourceTruckingRef).where(sql`source_trucking_ref IS NOT NULL`),
    index("invoice_selling_cost_master_job_ref_idx").on(table.companyId, table.sourceMasterJobRef).where(sql`source_master_job_ref IS NOT NULL`),
    check("invoice_selling_cost_vat_code_check", sql`${table.vatCode} IN ('S21', 'Z69', 'RC', 'OUT')`),
  ],
);

export type InvoiceSellingCostRecord = typeof invoiceSellingCostTable.$inferSelect;
export type NewInvoiceSellingCostRecord = typeof invoiceSellingCostTable.$inferInsert;
