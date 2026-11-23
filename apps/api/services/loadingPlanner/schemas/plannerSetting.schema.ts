import { sql } from "drizzle-orm";
import { check, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

// A company's Loading Planner settings: one row per company, written when a manager first changes
// them. A company without a row plans with the starting figures (lib/clearance.ts).
export const plannerSettingTable = pgTable(
  "planner_setting",
  {
    // Bare uuid of auth.company.id; there is no cross-database foreign key.
    companyId: uuid("company_id").primaryKey(),
    // The room left free in a standard container, in mm: beside and above a piece passing the door, and along the floor.
    doorWidthMm: integer("door_width_mm").notNull(),
    doorHeightMm: integer("door_height_mm").notNull(),
    lengthMm: integer("length_mm").notNull(),
    updatedByUserId: uuid("updated_by_user_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("planner_setting_clearance_check", sql`${table.doorWidthMm} BETWEEN 0 AND 500 AND ${table.doorHeightMm} BETWEEN 0 AND 500 AND ${table.lengthMm} BETWEEN 0 AND 500`),
  ],
);

export type PlannerSettingRecord = typeof plannerSettingTable.$inferSelect;
