import { sql } from "drizzle-orm";
import { pgTable, text, uuid, integer, jsonb, timestamp, index, uniqueIndex, foreignKey, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { gateMovementTable } from "./gateMovement.schema";
import { warehouseTaskTable } from "./warehouseTask.schema";

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
    source: text("source").notNull().default("manual"), // survey | tally | manual
    // Photos of the movement (warehouse_gate_file ids) attached as evidence.
    fileIds: jsonb("file_ids").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("open"), // open | resolved
    createdBy: text("created_by").notNull().default(""),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by").notNull().default(""),
    resolutionNote: text("resolution_note").notNull().default(""),
    // Id the phone gave the exception (floor mode); a replay of the same request adds nothing.
    clientRequestId: text("client_request_id"),
  },
  (table) => [
    ...defaultTableIndexes("warehouse_exception", table),
    tenantIndex("warehouse_exception", table),
    index("warehouse_exception_movement_idx").on(table.movementId),
    index("warehouse_exception_open_idx").on(table.companyId, table.movementId).where(sql`status = 'open' AND deleted_at IS NULL`),
    uniqueIndex("warehouse_exception_request_unique")
      .on(table.companyId, table.movementId, table.clientRequestId)
      .where(sql`client_request_id IS NOT NULL`),
    foreignKey({ name: "wh_exception_movement_fk", columns: [table.movementId], foreignColumns: [gateMovementTable.id] }).onDelete("restrict"),
    foreignKey({ name: "wh_exception_task_fk", columns: [table.taskId], foreignColumns: [warehouseTaskTable.id] }).onDelete("restrict"),
    index("wh_exception_task_idx").on(table.taskId),
    check("wh_exception_type_check", sql`${table.type} IN ('Damaged', 'Short', 'Over')`),
    check("wh_exception_status_check", sql`${table.status} IN ('open', 'resolved')`),
    check("wh_exception_source_check", sql`${table.source} IN ('survey', 'tally', 'manual')`),
  ],
);

export type WarehouseExceptionRecord = typeof warehouseExceptionTable.$inferSelect;
export type NewWarehouseExceptionRecord = typeof warehouseExceptionTable.$inferInsert;
