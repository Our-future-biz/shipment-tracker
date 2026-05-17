import { pgTable, text, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";

export const masterJobTable = pgTable(
  "master_job",
  {
    ...defaultTableColumns,
    mczNumber: text("mcz_number").notNull().unique(),
  },
  (table) => [
    ...defaultTableIndexes("master_job", table),
    index("master_job_mcz_number_idx").on(table.mczNumber),
  ],
);

export type MasterJobRecord = typeof masterJobTable.$inferSelect;
export type NewMasterJobRecord = typeof masterJobTable.$inferInsert;
