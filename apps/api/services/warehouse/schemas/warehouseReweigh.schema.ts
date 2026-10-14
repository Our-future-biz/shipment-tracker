import { sql } from "drizzle-orm";
import { pgTable, text, uuid, doublePrecision, boolean, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

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
    weighedKg: doublePrecision("weighed_kg").notNull(),
    // The declared gross weight it was compared with, as it was at the weighing.
    declaredKg: doublePrecision("declared_kg"),
    declaredSource: text("declared_source").notNull().default(""), // shipment | gate | ""
    variancePct: doublePrecision("variance_pct"),
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
  ],
);

export type WarehouseReweighRecord = typeof warehouseReweighTable.$inferSelect;
export type NewWarehouseReweighRecord = typeof warehouseReweighTable.$inferInsert;
