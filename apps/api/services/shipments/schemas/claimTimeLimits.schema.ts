import { sql } from "drizzle-orm";
import { boolean, check, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { defaultTableColumns, tenantColumns } from "../../../lib/db/defaults";

// The company's claim time limits (Council Outlay 11, D21): per mode, the days after delivery (else
// the ATA) within which the carrier must be told of a cargo claim, and the months after which a suit
// is time-barred. One row per company; none = never saved, the general practice shown and the limits
// off. The defaults are general practice (sea 3 days / road and rail 7 / air 14; suit 1 year, air 2
// years), NOT confirmed with the owner's insurer: switched OFF until a manager switches them on,
// which stamps who confirmed the numbers and when (lib/claimTimeLimits, services/claimTimeLimits.service).
export const claimTimeLimitsTable = pgTable(
  "claim_time_limits",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    enabled: boolean("enabled").notNull().default(false),
    seaNoticeDays: smallint("sea_notice_days").notNull().default(3),
    airNoticeDays: smallint("air_notice_days").notNull().default(14),
    railNoticeDays: smallint("rail_notice_days").notNull().default(7),
    roadNoticeDays: smallint("road_notice_days").notNull().default(7),
    seaSuitMonths: smallint("sea_suit_months").notNull().default(12),
    airSuitMonths: smallint("air_suit_months").notNull().default(24),
    railSuitMonths: smallint("rail_suit_months").notNull().default(12),
    roadSuitMonths: smallint("road_suit_months").notNull().default(12),
    // Who switched them on with these numbers, and when; cleared when they are switched off.
    confirmedByUserId: uuid("confirmed_by_user_id"),
    confirmedBy: text("confirmed_by").notNull().default(""),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    // Who saved them last, by e-mail.
    updatedByUserId: uuid("updated_by_user_id"),
    updatedBy: text("updated_by").notNull().default(""),
  },
  (table) => [
    uniqueIndex("claim_time_limits_company_unique").on(table.companyId),
    check(
      "claim_time_limits_numbers_check",
      sql`${table.seaNoticeDays} BETWEEN 1 AND 365 AND ${table.airNoticeDays} BETWEEN 1 AND 365 AND ${table.railNoticeDays} BETWEEN 1 AND 365 AND ${table.roadNoticeDays} BETWEEN 1 AND 365 AND ${table.seaSuitMonths} BETWEEN 1 AND 120 AND ${table.airSuitMonths} BETWEEN 1 AND 120 AND ${table.railSuitMonths} BETWEEN 1 AND 120 AND ${table.roadSuitMonths} BETWEEN 1 AND 120`,
    ),
    // On only with somebody's confirmation of the numbers.
    check("claim_time_limits_confirmed_check", sql`NOT ${table.enabled} OR ${table.confirmedAt} IS NOT NULL`),
  ],
);

export type ClaimTimeLimitsRecord = typeof claimTimeLimitsTable.$inferSelect;
export type NewClaimTimeLimitsRecord = typeof claimTimeLimitsTable.$inferInsert;
