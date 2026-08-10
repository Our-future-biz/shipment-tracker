import { sql } from "drizzle-orm";
import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export const termsConditionTable = pgTable(
  "terms_condition",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    name: text("name").notNull(),
    includes: text("includes").notNull().default(""),
    excludes: text("excludes").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("terms_condition", table),
    tenantIndex("terms_condition", table),
    // Case-insensitive unique name per company among live rows. Also serves the
    // lower(name) lookup used by findByNameInsensitive.
    uniqueIndex("terms_condition_company_name_unique")
      .on(table.companyId, sql`lower(${table.name})`)
      .where(sql`deleted_at IS NULL`),
  ],
);

export type TermsConditionRecord = typeof termsConditionTable.$inferSelect;
export type NewTermsConditionRecord = typeof termsConditionTable.$inferInsert;
