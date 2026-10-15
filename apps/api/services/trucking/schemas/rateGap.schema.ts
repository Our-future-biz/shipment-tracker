import { sql } from "drizzle-orm";
import { pgTable, text, integer, uuid, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import type { TariffScope, TariffSide } from "../interfaces/interfaces";

// Coverage gaps (Phase 7): a lane the rate engine could not price (rate calculator, quote road
// price, consignment and trip pricing; never the tariff test lane). Kept small: one row per
// (company, side, scope, service level, postcode, reason), upserted with a count and the last
// time. `service_level` is "" when the request named no level; `reason` has its dates taken out
// (lib/rateGaps.ts), so one gap is one row whatever the day.
export const truckingRateGapTable = pgTable(
  "trucking_rate_gap",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    side: text("side").$type<TariffSide>().notNull(),
    scope: text("scope").$type<TariffScope>().notNull(),
    serviceLevel: text("service_level").notNull().default(""),
    /** CZ postcode, 5 digits */
    postcode: text("postcode").notNull(),
    reason: text("reason").notNull(),
    count: integer("count").notNull().default(1),
    firstAt: timestamp("first_at", { withTimezone: true }).notNull().defaultNow(),
    lastAt: timestamp("last_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    tenantIndex("trucking_rate_gap", table),
    uniqueIndex("trucking_rate_gap_unique").on(table.companyId, table.side, table.scope, table.serviceLevel, table.postcode, table.reason),
    index("trucking_rate_gap_last_idx").on(table.companyId, table.lastAt),
    check("trucking_rate_gap_side_check", sql`${table.side} IN ('SELL', 'BUY', 'INTERNAL')`),
    check("trucking_rate_gap_scope_check", sql`${table.scope} IN ('LTL', 'FTL', 'LINEHAUL')`),
    check("trucking_rate_gap_count_check", sql`${table.count} >= 1`),
  ],
);

export type TruckingRateGapRecord = typeof truckingRateGapTable.$inferSelect;
