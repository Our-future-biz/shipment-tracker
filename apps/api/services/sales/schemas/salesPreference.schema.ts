import { pgTable, text, jsonb, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";

// Persisted Sales UI state (quote-history column picker, saved views).
export const salesPreferenceTable = pgTable(
  "sales_preference",
  {
    ...defaultTableColumns,
    prefKey: text("pref_key").notNull().unique(),
    value: jsonb("value").notNull().default({}),
  },
  (table) => [
    ...defaultTableIndexes("sales_preference", table),
    index("sales_preference_pref_key_idx").on(table.prefKey),
  ],
);

export type SalesPreferenceRecord = typeof salesPreferenceTable.$inferSelect;
export type NewSalesPreferenceRecord = typeof salesPreferenceTable.$inferInsert;
