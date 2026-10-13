import { pgTable, text, numeric, uuid, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// Lines of the Invoicing tab in Customs: what customs work is billed, by category.
export const customsInvoiceLineTable = pgTable(
  "customs_invoice_line",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    category: text("category").notNull().default(""),
    currency: text("currency").notNull().default("CZK"),
    value: numeric("value", { precision: 14, scale: 2 }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    ...defaultTableIndexes("customs_invoice_line", table),
    tenantIndex("customs_invoice_line", table),
    index("customs_invoice_line_shipment_id_idx").on(table.shipmentId),
  ],
);

// One Issued Invoice Number per shipment, covering all of its customs lines.
export const customsInvoiceTable = pgTable(
  "customs_invoice",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    issuedInvoiceNumber: text("issued_invoice_number").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("customs_invoice", table),
    tenantIndex("customs_invoice", table),
    index("customs_invoice_shipment_id_idx").on(table.shipmentId),
    // Unique per company: another company's row for the same id can never block this one.
    uniqueIndex("customs_invoice_company_shipment_unique").on(table.companyId, table.shipmentId),
  ],
);

export type CustomsInvoiceLineRecord = typeof customsInvoiceLineTable.$inferSelect;
export type NewCustomsInvoiceLineRecord = typeof customsInvoiceLineTable.$inferInsert;
export type CustomsInvoiceRecord = typeof customsInvoiceTable.$inferSelect;
