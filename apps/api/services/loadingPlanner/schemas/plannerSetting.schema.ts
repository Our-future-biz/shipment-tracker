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
    // Out-of-gauge cargo on an open top or flat rack is warned about above these, in mm: its width,
    // how far it sticks out over one end, and how high it stands above the floor.
    oogWidthMm: integer("oog_width_mm").notNull().default(3500),
    oogOverEndMm: integer("oog_over_end_mm").notNull().default(1000),
    oogHeightMm: integer("oog_height_mm").notNull().default(3200),
    // A single piece in a standard container, in kg: warned about above the first, planned onto an
    // open top or flat rack above the second.
    heavyWarnKg: integer("heavy_warn_kg").notNull().default(5000),
    heavyMoveKg: integer("heavy_move_kg").notNull().default(10000),
    // The gross weight (cargo with the empty container) above which a plan warns about the road leg,
    // in kg, for a 20' and for a 40' or 45' container; null: no warning (Council Outlay 14, P2).
    roadGross20Kg: integer("road_gross_20_kg"),
    roadGross40Kg: integer("road_gross_40_kg"),
    updatedByUserId: uuid("updated_by_user_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("planner_setting_road_check", sql`(${table.roadGross20Kg} IS NULL OR ${table.roadGross20Kg} BETWEEN 5000 AND 60000) AND (${table.roadGross40Kg} IS NULL OR ${table.roadGross40Kg} BETWEEN 5000 AND 60000)`),
    check("planner_setting_heavy_check", sql`${table.heavyWarnKg} > 0 AND ${table.heavyMoveKg} >= ${table.heavyWarnKg}`),
    check("planner_setting_oog_check", sql`${table.oogWidthMm} > 0 AND ${table.oogOverEndMm} >= 0 AND ${table.oogHeightMm} > 0`),
    check("planner_setting_clearance_check", sql`${table.doorWidthMm} BETWEEN 0 AND 500 AND ${table.doorHeightMm} BETWEEN 0 AND 500 AND ${table.lengthMm} BETWEEN 0 AND 500`),
  ],
);

export type PlannerSettingRecord = typeof plannerSettingTable.$inferSelect;
