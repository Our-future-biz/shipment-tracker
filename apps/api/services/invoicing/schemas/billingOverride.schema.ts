import { pgTable, text, numeric, uuid, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export const billingOverrideTable = pgTable(
  "billing_override",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    rowKey: text("row_key").notNull(),
    billingAmount: numeric("billing_amount", { precision: 14, scale: 2 }),
  },
  (table) => [
    ...defaultTableIndexes("billing_override", table),
    tenantIndex("billing_override", table),
    index("billing_override_shipment_id_idx").on(table.shipmentId),
  ],
);

export type BillingOverrideRecord = typeof billingOverrideTable.$inferSelect;
export type NewBillingOverrideRecord = typeof billingOverrideTable.$inferInsert;
