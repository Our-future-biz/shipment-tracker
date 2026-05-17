import { pgTable, text, uuid, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";

export const shipmentTaskTable = pgTable(
  "shipment_task",
  {
    ...defaultTableColumns,
    shipmentId: uuid("shipment_id").notNull(),
    taskKey: text("task_key").notNull(),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedById: uuid("completed_by_id"),
  },
  (table) => [
    ...defaultTableIndexes("shipment_task", table),
    index("shipment_task_shipment_id_idx").on(table.shipmentId),
  ],
);

export type ShipmentTaskRecord = typeof shipmentTaskTable.$inferSelect;
export type NewShipmentTaskRecord = typeof shipmentTaskTable.$inferInsert;
