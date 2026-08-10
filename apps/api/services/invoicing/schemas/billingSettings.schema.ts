import { pgTable, text, numeric, uuid, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export const billingSettingsTable = pgTable(
  "billing_settings",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    // shipment_id is a globally-unique UUID, so one settings row per shipment holds across companies.
    shipmentId: uuid("shipment_id").notNull().unique(),
    billingCurrency: text("billing_currency").notNull().default("CZK"),
    roe: numeric("roe", { precision: 14, scale: 6 }).notNull().default("1"),
    quoteRef: text("quote_ref").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("billing_settings", table),
    tenantIndex("billing_settings", table),
    index("billing_settings_shipment_id_idx").on(table.shipmentId),
  ],
);

export type BillingSettingsRecord = typeof billingSettingsTable.$inferSelect;
export type NewBillingSettingsRecord = typeof billingSettingsTable.$inferInsert;
