import { sql } from "drizzle-orm";
import { pgTable, text, numeric, date, uniqueIndex, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

/**
 * Weekly exchange rates, entered by hand on the Exchange page. Rates are always CZK per
 * 1 unit of the currency (CZK is the base, = 1).
 *
 * week: ISO week as "2026-W36". A shipment's ETA/ETD date is turned into its week to find
 * the rate that applies.
 */
export const exchangeRateTable = pgTable(
  "exchange_rate",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    /** ISO week, e.g. "2026-W36" */
    week: text("week").notNull(),
    /** Monday of the week — for sorting and finding the nearest rate */
    validFrom: date("valid_from", { mode: "string" }).notNull(),
    /** Sunday of the week */
    validTo: date("valid_to", { mode: "string" }).notNull(),
    /** CZK per 1 EUR */
    rateEur: numeric("rate_eur", { precision: 14, scale: 4 }),
    /** CZK per 1 USD */
    rateUsd: numeric("rate_usd", { precision: 14, scale: 4 }),
    note: text("note").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("exchange_rate", table),
    tenantIndex("exchange_rate", table),
    // One live rate per week; a deleted week can be entered again.
    uniqueIndex("exchange_rate_company_week_unique").on(table.companyId, table.week).where(sql`deleted_at IS NULL`),
    index("exchange_rate_valid_from_idx").on(table.validFrom),
  ],
);

export type ExchangeRateRecord = typeof exchangeRateTable.$inferSelect;
export type NewExchangeRateRecord = typeof exchangeRateTable.$inferInsert;
