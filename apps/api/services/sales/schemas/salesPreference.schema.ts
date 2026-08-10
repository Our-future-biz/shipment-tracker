import { sql } from "drizzle-orm";
import { pgTable, text, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// Persisted Sales UI state (quote-history column picker, saved views, follow-up tasks),
// scoped per company so companies never share UI state.
export const salesPreferenceTable = pgTable(
  "sales_preference",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    prefKey: text("pref_key").notNull(),
    value: jsonb("value").notNull().default({}),
  },
  (table) => [
    ...defaultTableIndexes("sales_preference", table),
    tenantIndex("sales_preference", table),
    uniqueIndex("sales_preference_company_key_unique")
      .on(table.companyId, table.prefKey)
      .where(sql`deleted_at IS NULL`),
  ],
);

export type SalesPreferenceRecord = typeof salesPreferenceTable.$inferSelect;
export type NewSalesPreferenceRecord = typeof salesPreferenceTable.$inferInsert;
