import { pgTable, text, date, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";

// A ČNB fixing still missing after the last scheduled pull (16:00 Prague). Shown to
// admins under the bell and e-mailed to them once; resolved automatically when the
// fixing is imported. One alert per fixing day.
export const fxAlertTable = pgTable(
  "fx_alert",
  {
    ...defaultTableColumns,
    fixingDate: date("fixing_date", { mode: "string" }).notNull(),
    reason: text("reason").notNull(),
    raisedAt: timestamp("raised_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    emailError: text("email_error").notNull().default(""),
  },
  (table) => [...defaultTableIndexes("fx_alert", table), uniqueIndex("fx_alert_fixing_date_unique").on(table.fixingDate)],
);

export type FxAlertRecord = typeof fxAlertTable.$inferSelect;
