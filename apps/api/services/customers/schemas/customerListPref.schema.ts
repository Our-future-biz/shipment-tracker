import { sql } from "drizzle-orm";
import { pgTable, text, jsonb, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// What a user has set up for the Customer Database list: the columns shown and the saved filter and column
// templates, one JSON value per key ("columns", "filter-templates", "column-templates"). Kept here, apart
// from the Shipments preferences, so the customer list never shares or mixes them with the shipment grids.
export const customerListPrefTable = pgTable(
  "customer_list_pref",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    userId: uuid("user_id").notNull(),
    prefKey: text("pref_key").notNull(),
    value: jsonb("value").notNull().default({}),
  },
  (table) => [
    ...defaultTableIndexes("customer_list_pref", table),
    tenantIndex("customer_list_pref", table),
    uniqueIndex("customer_list_pref_user_key_unique")
      .on(table.companyId, table.userId, table.prefKey)
      .where(sql`deleted_at IS NULL`),
  ],
);

export type CustomerListPrefRecord = typeof customerListPrefTable.$inferSelect;
