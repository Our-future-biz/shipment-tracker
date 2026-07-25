import { pgTable, text, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";

export const termsConditionTable = pgTable(
  "terms_condition",
  {
    ...defaultTableColumns,
    name: text("name").notNull().unique(),
    includes: text("includes").notNull().default(""),
    excludes: text("excludes").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("terms_condition", table),
    index("terms_condition_name_idx").on(table.name),
  ],
);

export type TermsConditionRecord = typeof termsConditionTable.$inferSelect;
export type NewTermsConditionRecord = typeof termsConditionTable.$inferInsert;
