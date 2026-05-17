import { pgTable, text, numeric, uuid, jsonb, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";

export const warehouseTaskTable = pgTable(
  "warehouse_task",
  {
    ...defaultTableColumns,
    taskId: text("task_id").notNull().unique(),
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
    index("warehouse_task_task_id_idx").on(table.taskId),
    index("warehouse_task_shipment_id_idx").on(table.shipmentId),
  ],
);

export type WarehouseTaskRecord = typeof warehouseTaskTable.$inferSelect;
export type NewWarehouseTaskRecord = typeof warehouseTaskTable.$inferInsert;
