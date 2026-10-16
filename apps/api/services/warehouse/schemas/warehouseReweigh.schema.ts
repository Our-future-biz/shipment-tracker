import { sql } from "drizzle-orm";
import { pgTable, text, uuid, boolean, jsonb, timestamp, index, uniqueIndex, numeric, foreignKey, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { gateMovementTable } from "./gateMovement.schema";
import { warehouseTaskTable } from "./warehouseTask.schema";

// Re-weighing of LCL cargo on receipt (what the warehouse calls "VGM"): every LCL position is
// weighed by the warehouse before its receipt (export: before the WH receipt; import: before the
// house is ticked off at the stripping tally). Append-only: a correction is a new row and the
// latest `weighed_at` counts; the history stays.
export const warehouseReweighTable = pgTable(
  "warehouse_reweigh",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    movementId: uuid("movement_id").notNull(),
    taskId: uuid("task_id"),
    weighedKg: numeric("weighed_kg", { precision: 12, scale: 3, mode: "number" }).notNull(),
    // The declared gross weight it was compared with, as it was at the weighing.
    declaredKg: numeric("declared_kg", { precision: 12, scale: 3, mode: "number" }),
    declaredSource: text("declared_source").notNull().default(""), // shipment | gate | ""
    variancePct: numeric("variance_pct", { precision: 9, scale: 4, mode: "number" }),
    flagged: boolean("flagged").notNull().default(false),
    weighedBy: text("weighed_by").notNull().default(""),
    weighedAt: timestamp("weighed_at", { withTimezone: true }).notNull(),
    // Scale photos of the movement (warehouse_gate_file ids).
    fileIds: jsonb("file_ids").$type<string[]>().notNull().default([]),
    note: text("note").notNull().default(""),
    clientRequestId: text("client_request_id"),
  },
  (table) => [
    ...defaultTableIndexes("warehouse_reweigh", table),
    tenantIndex("warehouse_reweigh", table),
    index("warehouse_reweigh_movement_idx").on(table.movementId, table.weighedAt.desc()),
    uniqueIndex("warehouse_reweigh_request_unique")
      .on(table.companyId, table.movementId, table.clientRequestId)
      .where(sql`client_request_id IS NOT NULL`),
    foreignKey({ name: "wh_reweigh_movement_fk", columns: [table.movementId], foreignColumns: [gateMovementTable.id] }).onDelete("restrict"),
    foreignKey({ name: "wh_reweigh_task_fk", columns: [table.taskId], foreignColumns: [warehouseTaskTable.id] }).onDelete("restrict"),
    index("wh_reweigh_task_idx").on(table.taskId),
    check("wh_reweigh_weight_check", sql`${table.weighedKg} >= 0`),
  ],
);

export type WarehouseReweighRecord = typeof warehouseReweighTable.$inferSelect;
export type NewWarehouseReweighRecord = typeof warehouseReweighTable.$inferInsert;
