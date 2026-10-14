import { pgTable, text, date, integer, uuid, timestamp } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";

// One attempt to fetch ČNB rates, kept for the Exchange page's import log and the
// "is the data fresh?" check.
//   trigger: startup | interval | cron | page | manual | backfill
//   status:  ok (new fixings stored) | no_new_data | failed
export const cnbImportRunTable = pgTable(
  "cnb_import_run",
  {
    ...defaultTableColumns,
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    trigger: text("trigger").notNull(),
    status: text("status").notNull().default("running"),
    fromDate: date("from_date", { mode: "string" }),
    toDate: date("to_date", { mode: "string" }),
    rowsAdded: integer("rows_added").notNull().default(0),
    latestValidDate: date("latest_valid_date", { mode: "string" }), // newest fixing ČNB offered
    error: text("error").notNull().default(""),
    triggeredBy: uuid("triggered_by"),
  },
  (table) => [...defaultTableIndexes("cnb_import_run", table)],
);

export type CnbImportRunRecord = typeof cnbImportRunTable.$inferSelect;
export type NewCnbImportRunRecord = typeof cnbImportRunTable.$inferInsert;
