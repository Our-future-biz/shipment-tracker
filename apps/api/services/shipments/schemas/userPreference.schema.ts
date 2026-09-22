import { sql } from "drizzle-orm";
import { pgTable, text, jsonb, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

/**
 * Ulozene nastaveni rozhrani pro konkretniho uzivatele.
 * Prvni pouziti: vyber poli zobrazenych v kartach na zalozce Details
 * (prefKey "detail-card-fields"), aby si kazdy mohl karty upravit po svem.
 */
export const userPreferenceTable = pgTable(
  "user_preference",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    userId: uuid("user_id").notNull(),
    prefKey: text("pref_key").notNull(),
    value: jsonb("value").notNull().default({}),
  },
  (table) => [
    ...defaultTableIndexes("user_preference", table),
    tenantIndex("user_preference", table),
    uniqueIndex("user_preference_user_key_unique")
      .on(table.companyId, table.userId, table.prefKey)
      .where(sql`deleted_at IS NULL`),
  ],
);

export type UserPreferenceRecord = typeof userPreferenceTable.$inferSelect;
