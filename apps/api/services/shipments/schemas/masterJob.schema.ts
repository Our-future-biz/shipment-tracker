import { sql } from "drizzle-orm";
import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export const masterJobTable = pgTable(
  "master_job",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    mczNumber: text("mcz_number").notNull(),
  },
  (table) => [
    ...defaultTableIndexes("master_job", table),
    tenantIndex("master_job", table),
    // MCZ numbers are unique per company among live rows.
    uniqueIndex("master_job_company_mcz_unique")
      .on(table.companyId, table.mczNumber)
      .where(sql`deleted_at IS NULL`),
  ],
);

export type MasterJobRecord = typeof masterJobTable.$inferSelect;
export type NewMasterJobRecord = typeof masterJobTable.$inferInsert;
