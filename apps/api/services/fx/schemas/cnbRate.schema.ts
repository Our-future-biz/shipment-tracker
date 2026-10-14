import { pgTable, text, date, integer, numeric, uuid, uniqueIndex, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";

// One ČNB fixing for one currency, stored exactly as published. Reference data shared by
// every company, so no company_id. Only fixing days are stored: a weekend or public
// holiday uses the previous fixing (ČNB's own validity rule), resolved at read time.
// A stored row is never updated — documents that used it must stay reproducible.
export const cnbRateTable = pgTable(
  "cnb_rate",
  {
    ...defaultTableColumns,
    validDate: date("valid_date", { mode: "string" }).notNull(), // ČNB "validFor"
    currency: text("currency").notNull(), // ISO code, e.g. EUR
    amount: integer("amount").notNull(), // units the rate is quoted for (1, 100, 1000)
    rate: numeric("rate", { precision: 12, scale: 4 }).notNull(), // CZK per `amount` units
    fixingNo: integer("fixing_no"), // ČNB "order"; the yearly feed doesn't carry it
    source: text("source").notNull().default("CNB_API"),
    importRunId: uuid("import_run_id"),
  },
  (table) => [
    ...defaultTableIndexes("cnb_rate", table),
    uniqueIndex("cnb_rate_date_currency_unique").on(table.validDate, table.currency),
    index("cnb_rate_currency_date_idx").on(table.currency, table.validDate),
  ],
);

export type CnbRateRecord = typeof cnbRateTable.$inferSelect;
export type NewCnbRateRecord = typeof cnbRateTable.$inferInsert;
