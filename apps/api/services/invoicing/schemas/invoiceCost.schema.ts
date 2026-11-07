import { sql } from "drizzle-orm";
import { pgTable, text, numeric, uuid, integer, boolean, index, date, timestamp, check } from "drizzle-orm/pg-core";
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
    /** When Received was ticked (stamped by the server; cleared with it): its due day is this plus the supplier's payment days. */
    receivedAt: timestamp("received_at", { withTimezone: true }),
    /** The day the received invoice was paid; null while unpaid (Council Outlay 7, step 6b). */
    paidOn: date("paid_on", { mode: "string" }),
    /** When Paid was noted and by whom (e-mail and user); null while unpaid (Council Review 5, K6). */
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidByUserId: uuid("paid_by_user_id"),
    paidBy: text("paid_by"),
    vendor: text("vendor").notNull().default(""),
    /** The haulier the cost is owed to: a company of the Customer Database (no FK - another service's database). */
    haulierId: uuid("haulier_id"),
    /**
     * The supplier the vendor text names, when it was picked from the Customer Database (or came so from
     * the quote): a company id, no FK. Null for a vendor only typed. Lets its rating show beside it.
     */
    supplierCustomerId: uuid("supplier_customer_id"),
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
     * The master job's cost line this row is the shipment's share of ("master:<masterJobId>:<lineId>");
     * null for any other row. Such rows are kept by the master job's Costs Breakdown (worked out again
     * as a set) and read-only here.
     */
    sourceMasterJobRef: text("source_master_job_ref"),
    /**
     * Posted from a vendor invoice or credit note read line by line (POST /invoicing/invoice-lines), as a
     * row of its own or onto the estimate it belongs to. A cost posted by charge code later (one shipment's
     * invoice, a master job's split) never lands on it, so it is neither overwritten nor taken for that cost.
     */
    postedFromLines: boolean("posted_from_lines").notNull().default(false),
  },
  (table) => [
    ...defaultTableIndexes("invoice_cost", table),
    tenantIndex("invoice_cost", table),
    index("invoice_cost_shipment_id_idx").on(table.shipmentId),
    index("invoice_cost_trucking_ref_idx").on(table.companyId, table.sourceTruckingRef).where(sql`source_trucking_ref IS NOT NULL`),
    index("invoice_cost_master_job_ref_idx").on(table.companyId, table.sourceMasterJobRef).where(sql`source_master_job_ref IS NOT NULL`),
    // What we owe a supplier: its open lines entered here (Trucking's rows and a master job's shares are counted
    // elsewhere), by the company picked or the haulier, and the vendor texts linked to none. The vendor is not an
    // index column: a long typed text would not fit a btree entry.
    index("invoice_cost_supplier_open_idx")
      .on(table.companyId, table.supplierCustomerId)
      .where(sql`deleted_at IS NULL AND paid_on IS NULL AND supplier_customer_id IS NOT NULL AND source_trucking_ref IS NULL AND source_master_job_ref IS NULL`),
    index("invoice_cost_haulier_open_idx")
      .on(table.companyId, table.haulierId)
      .where(sql`deleted_at IS NULL AND paid_on IS NULL AND haulier_id IS NOT NULL AND source_trucking_ref IS NULL AND source_master_job_ref IS NULL`),
    index("invoice_cost_unlinked_open_idx")
      .on(table.companyId)
      .where(sql`deleted_at IS NULL AND paid_on IS NULL AND supplier_customer_id IS NULL AND haulier_id IS NULL AND source_trucking_ref IS NULL AND source_master_job_ref IS NULL`),
    // The jobs a supplier is on (its page's Open jobs and when it was last used): its live lines of any source.
    index("invoice_cost_supplier_used_idx").on(table.companyId, table.supplierCustomerId).where(sql`deleted_at IS NULL AND supplier_customer_id IS NOT NULL`),
    index("invoice_cost_haulier_used_idx").on(table.companyId, table.haulierId).where(sql`deleted_at IS NULL AND haulier_id IS NOT NULL`),
    // A cost is paid only once its invoice was received (also when two people change it at once).
    check("invoice_cost_paid_check", sql`${table.paidOn} IS NULL OR ${table.received}`),
  ],
);

export type InvoiceCostRecord = typeof invoiceCostTable.$inferSelect;
export type NewInvoiceCostRecord = typeof invoiceCostTable.$inferInsert;
