import { pgTable, text, date, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// One row of the World Holidays list: a national holiday, a regional one, or both
// (the same columns as the holiday spreadsheet). Dates are yyyy-mm-dd; an end date
// left blank means a one-day holiday.
export const publicHolidayTable = pgTable(
  "public_holiday",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    country: text("country").notNull().default(""),
    countryCode: text("country_code").notNull().default(""),
    nationalHoliday: text("national_holiday").notNull().default(""),
    nationalStart: date("national_start", { mode: "string" }),
    nationalEnd: date("national_end", { mode: "string" }),
    regionalHoliday: text("regional_holiday").notNull().default(""),
    regionalStart: date("regional_start", { mode: "string" }),
    regionalEnd: date("regional_end", { mode: "string" }),
    regions: text("regions").notNull().default(""),
    source: text("source").notNull().default(""), // file the row was read from
  },
  (table) => [
    ...defaultTableIndexes("public_holiday", table),
    tenantIndex("public_holiday", table),
    index("public_holiday_national_start_idx").on(table.nationalStart),
    index("public_holiday_regional_start_idx").on(table.regionalStart),
  ],
);

export type PublicHolidayRecord = typeof publicHolidayTable.$inferSelect;
export type NewPublicHolidayRecord = typeof publicHolidayTable.$inferInsert;
