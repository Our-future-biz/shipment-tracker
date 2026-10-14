import { sql } from "drizzle-orm";
import { pgTable, text, date, integer, uuid, timestamp, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";
import type { ImportRunStatus, SyncTrigger } from "../interfaces/interfaces";

// One attempt to fetch ČNB rates, kept for the Exchange page's import log and the
// "is the data fresh?" check.
//   trigger: startup | schedule | cron | manual | backfill
//   status:  running → ok (new fixings stored) | no_new_data | failed
export const cnbImportRunTable = pgTable(
  "cnb_import_run",
  {
    ...defaultTableColumns,
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    trigger: text("trigger").$type<SyncTrigger>().notNull(),
    status: text("status").$type<ImportRunStatus>().notNull().default("running"),
    fromDate: date("from_date", { mode: "string" }),
    toDate: date("to_date", { mode: "string" }),
    rowsAdded: integer("rows_added").notNull().default(0),
    latestValidDate: date("latest_valid_date", { mode: "string" }), // newest fixing ČNB offered
    error: text("error").notNull().default(""),
    triggeredBy: uuid("triggered_by"),
  },
  (table) => [
    ...defaultTableIndexes("cnb_import_run", table),
    check("cnb_import_run_trigger_check", sql`${table.trigger} IN ('startup', 'schedule', 'cron', 'manual', 'backfill')`),
    check("cnb_import_run_status_check", sql`${table.status} IN ('running', 'ok', 'no_new_data', 'failed')`),
  ],
);

export type CnbImportRunRecord = typeof cnbImportRunTable.$inferSelect;
export type NewCnbImportRunRecord = typeof cnbImportRunTable.$inferInsert;
