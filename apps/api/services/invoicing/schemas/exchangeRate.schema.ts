import { pgTable, text, numeric, uuid, uniqueIndex, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

/**
 * Kurzovni listek s tydenni platnosti - zadava se rucne na strance Exchange.
 * Kurzy jsou vzdy v CZK za 1 jednotku meny (CZK je zaklad = 1).
 *
 * week: ISO tyden ve tvaru "2026-W36". Datum ETA/ETD zasilky se prevede
 * na tyden a podle nej se najde platny kurz.
 */
export const exchangeRateTable = pgTable(
  "exchange_rate",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    /** ISO tyden, napr. "2026-W36" */
    week: text("week").notNull(),
    /** pondeli daneho tydne (YYYY-MM-DD) - pro razeni a hledani nejblizsiho kurzu */
    validFrom: text("valid_from").notNull(),
    /** nedele daneho tydne (YYYY-MM-DD) */
    validTo: text("valid_to").notNull(),
    /** CZK za 1 EUR */
    rateEur: numeric("rate_eur", { precision: 14, scale: 4 }),
    /** CZK za 1 USD */
    rateUsd: numeric("rate_usd", { precision: 14, scale: 4 }),
    note: text("note").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("exchange_rate", table),
    tenantIndex("exchange_rate", table),
    uniqueIndex("exchange_rate_company_week_unique").on(table.companyId, table.week),
    index("exchange_rate_valid_from_idx").on(table.validFrom),
  ],
);

export type ExchangeRateRecord = typeof exchangeRateTable.$inferSelect;
export type NewExchangeRateRecord = typeof exchangeRateTable.$inferInsert;
