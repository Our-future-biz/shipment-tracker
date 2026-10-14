import { sql } from "drizzle-orm";
import { pgTable, text, uuid, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { shipmentTable } from "./shipment.schema";

export const shipmentTaskTable = pgTable(
  "shipment_task",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull().references(() => shipmentTable.id, { onDelete: "cascade" }),
    taskKey: text("task_key").notNull(),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedById: uuid("completed_by_id"),
  },
  (table) => [
    ...defaultTableIndexes("shipment_task", table),
    tenantIndex("shipment_task", table),
    index("shipment_task_shipment_id_idx").on(table.shipmentId),
    // One row per task of a shipment, so concurrent upserts can't duplicate it.
    uniqueIndex("shipment_task_company_shipment_key_uq")
      .on(table.companyId, table.shipmentId, table.taskKey)
      .where(sql`deleted_at IS NULL`),
  ],
);

export type ShipmentTaskRecord = typeof shipmentTaskTable.$inferSelect;
export type NewShipmentTaskRecord = typeof shipmentTaskTable.$inferInsert;
