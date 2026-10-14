import { sql } from "drizzle-orm";
import { pgTable, text, date, numeric, uuid, index, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// The company ROE %, as a history: every change is a new row and rows are never edited.
// The % in force on a date is the newest row with effective_from on or before it;
// a company with no rows uses 100 % (the pure ČNB rate).
export const roeSettingTable = pgTable(
  "roe_setting",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    pct: numeric("pct", { precision: 6, scale: 3 }).notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    note: text("note").notNull().default(""),
    changedBy: uuid("changed_by").notNull(),
  },
  (table) => [
    ...defaultTableIndexes("roe_setting", table),
    tenantIndex("roe_setting", table),
    index("roe_setting_company_effective_idx").on(table.companyId, table.effectiveFrom),
    check("roe_setting_pct_check", sql`${table.pct} BETWEEN 80 AND 120`),
  ],
);

export type RoeSettingRecord = typeof roeSettingTable.$inferSelect;
export type NewRoeSettingRecord = typeof roeSettingTable.$inferInsert;
