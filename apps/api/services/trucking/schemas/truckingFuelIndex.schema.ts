import { sql } from "drizzle-orm";
import { pgTable, text, numeric, uniqueIndex, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// The fuel surcharge % per month ("YYYY-MM"), set by a manager; tariff surcharges with the calc
// FUEL_INDEX take the % of the pickup month. One row per company and month; a change overwrites
// it (the before/after goes to trucking_event).
export const truckingFuelIndexTable = pgTable(
  "trucking_fuel_index",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    month: text("month").notNull(),
    percent: numeric("percent", { precision: 6, scale: 3, mode: "number" }).notNull(),
    /** Display name of who set it last */
    updatedBy: text("updated_by").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("trucking_fuel_index", table),
    tenantIndex("trucking_fuel_index", table),
    uniqueIndex("trucking_fuel_index_month_unique").on(table.companyId, table.month),
    check("trucking_fuel_index_month_check", sql`${table.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check("trucking_fuel_index_percent_check", sql`${table.percent} >= 0 AND ${table.percent} <= 100`),
  ],
);

export type TruckingFuelIndexRecord = typeof truckingFuelIndexTable.$inferSelect;
