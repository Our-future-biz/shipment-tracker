import { sql } from "drizzle-orm";
import { pgTable, text, uuid, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// Damage / short / over (OS&D) exceptions of a gate movement, recorded from a survey or by hand.
// An open exception puts the cargo ON HOLD: the release gate gets the "No open exceptions" line
// (Blocked) and the WH release is refused until every exception is resolved (with a note).
export const warehouseExceptionTable = pgTable(
  "warehouse_exception",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    movementId: uuid("movement_id").notNull(),
    taskId: uuid("task_id"),
    type: text("type").notNull(), // Damaged | Short | Over
    pieces: integer("pieces").notNull().default(0),
    note: text("note").notNull().default(""),
    container: text("container").notNull().default(""),
    surveyPhase: text("survey_phase").notNull().default(""),
    source: text("source").notNull().default("manual"), // survey | manual
    // Photos of the movement (warehouse_gate_file ids) attached as evidence.
    fileIds: jsonb("file_ids").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("open"), // open | resolved
    createdBy: text("created_by").notNull().default(""),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by").notNull().default(""),
    resolutionNote: text("resolution_note").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("warehouse_exception", table),
    tenantIndex("warehouse_exception", table),
    index("warehouse_exception_movement_idx").on(table.movementId),
    index("warehouse_exception_open_idx").on(table.companyId, table.movementId).where(sql`status = 'open' AND deleted_at IS NULL`),
  ],
);

export type WarehouseExceptionRecord = typeof warehouseExceptionTable.$inferSelect;
export type NewWarehouseExceptionRecord = typeof warehouseExceptionTable.$inferInsert;
