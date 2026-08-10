import { sql } from "drizzle-orm";
import { pgTable, text, numeric, uuid, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export const warehouseTaskTable = pgTable(
  "warehouse_task",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    taskId: text("task_id").notNull(),
    shipmentId: uuid("shipment_id"),
    type: text("type").notNull().default("Import"),
    priority: text("priority").notNull().default("Medium"),
    status: text("status").notNull().default("Pending"),
    assignee: text("assignee").notNull().default(""),
    dueDate: text("due_date").notNull().default(""),
    cargo: text("cargo").notNull().default(""),
    weight: text("weight").notNull().default(""),
    notes: text("notes").notNull().default(""),
    data: jsonb("data"),
  },
  (table) => [
    ...defaultTableIndexes("warehouse_task", table),
    tenantIndex("warehouse_task", table),
    // Task references are a per-company sequence (WHCZ…), unique within a company among live rows.
    uniqueIndex("warehouse_task_company_task_id_unique")
      .on(table.companyId, table.taskId)
      .where(sql`deleted_at IS NULL`),
    index("warehouse_task_shipment_id_idx").on(table.shipmentId),
  ],
);

export type WarehouseTaskRecord = typeof warehouseTaskTable.$inferSelect;
export type NewWarehouseTaskRecord = typeof warehouseTaskTable.$inferInsert;
