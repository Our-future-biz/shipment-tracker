import { sql } from "drizzle-orm";
import { pgTable, text, numeric, uuid, integer, boolean, index, foreignKey } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { supplierInvoiceTable } from "./supplierInvoice.schema";

/** How a master job's cost line is shared out over its shipments: by freight tons (W/M), or equally. */
export type MasterJobSplitMethod = "wm" | "shipment";

/**
 * A buying cost of a whole master job (its Costs Breakdown). It is never billed as it is: once the
 * split is processed, each linked shipment carries its share as a row of its own Costs Breakdown
 * (invoice_cost with source_master_job_ref). Changes reach the shipments the next time it is processed.
 * Amounts as on a shipment's buying line: a unit amount times the quantity.
 */
export const masterJobCostTable = pgTable(
  "master_job_cost",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    /** The master job (shipments service; no FK - another service's database). */
    masterJobId: uuid("master_job_id").notNull(),
    category: text("category").notNull().default(""),
    description: text("description").notNull().default(""),
    vendor: text("vendor").notNull().default(""),
    estQty: numeric("est_qty", { precision: 14, scale: 2 }),
    estAmount: numeric("est_amount", { precision: 14, scale: 2 }),
    estCurrency: text("est_currency").notNull().default("CZK"),
    realQty: numeric("real_qty", { precision: 14, scale: 2 }),
    realAmount: numeric("real_amount", { precision: 14, scale: 2 }),
    realCurrency: text("real_currency").notNull().default("CZK"),
    invoiceNumber: text("invoice_number").notNull().default(""),
    received: boolean("received").notNull().default(false),
    splitMethod: text("split_method").$type<MasterJobSplitMethod>().notNull().default("wm"),
    /** Whether the line is shared out at all: without it the cost stays on the master job and no shipment carries a part. */
    inSplit: boolean("in_split").notNull().default(true),
    /** The shipments taken out of this line's split; one linked later is in it until someone takes it out. */
    excludedShipmentIds: text("excluded_shipment_ids").array().notNull().default(sql`'{}'::text[]`),
    sortOrder: integer("sort_order").notNull().default(0),
    /** The supplier invoice the line is billed on (Accounts Payable): one row there for the master job's bill, paid once. */
    supplierInvoiceId: uuid("supplier_invoice_id"),
  },
  (table) => [
    ...defaultTableIndexes("master_job_cost", table),
    tenantIndex("master_job_cost", table),
    index("master_job_cost_master_job_id_idx").on(table.companyId, table.masterJobId),
    index("master_job_cost_supplier_invoice_idx").on(table.supplierInvoiceId).where(sql`supplier_invoice_id IS NOT NULL`),
    foreignKey({ columns: [table.supplierInvoiceId], foreignColumns: [supplierInvoiceTable.id], name: "master_job_cost_supplier_invoice_fk" }).onDelete("set null"),
  ],
);

export type MasterJobCostRecord = typeof masterJobCostTable.$inferSelect;
export type NewMasterJobCostRecord = typeof masterJobCostTable.$inferInsert;
