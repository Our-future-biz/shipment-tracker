import { pgTable, text, numeric, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export const billingSettingsTable = pgTable(
  "billing_settings",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    billingCurrency: text("billing_currency").notNull().default("CZK"),
    roe: numeric("roe", { precision: 14, scale: 6 }).notNull().default("1"),
    quoteRef: text("quote_ref").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("billing_settings", table),
    tenantIndex("billing_settings", table),
    index("billing_settings_shipment_id_idx").on(table.shipmentId),
    // One settings row per shipment, unique per company so another company's row never blocks it.
    uniqueIndex("billing_settings_company_shipment_unique").on(table.companyId, table.shipmentId),
  ],
);

export type BillingSettingsRecord = typeof billingSettingsTable.$inferSelect;
export type NewBillingSettingsRecord = typeof billingSettingsTable.$inferInsert;
