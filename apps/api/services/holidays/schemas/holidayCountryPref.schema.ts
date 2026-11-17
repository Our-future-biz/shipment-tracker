import { sql } from "drizzle-orm";
import { pgTable, jsonb, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// The countries whose holidays a user cares about (owner, 17 Nov 2026): the Public Holidays page and
// the year calendar show only theirs; none picked shows every country. One row per user, kept on the
// account, so it follows the user from browser to browser.
export const holidayCountryPrefTable = pgTable(
  "holiday_country_pref",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    userId: uuid("user_id").notNull(),
    // The countries as the World Holidays list names them (its Country, else its Country code).
    countries: jsonb("countries").$type<string[]>().notNull().default([]),
  },
  (table) => [
    ...defaultTableIndexes("holiday_country_pref", table),
    tenantIndex("holiday_country_pref", table),
    uniqueIndex("holiday_country_pref_user_unique").on(table.companyId, table.userId).where(sql`deleted_at IS NULL`),
  ],
);

export type HolidayCountryPrefRecord = typeof holidayCountryPrefTable.$inferSelect;
