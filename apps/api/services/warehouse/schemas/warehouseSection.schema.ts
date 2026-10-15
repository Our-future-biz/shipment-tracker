import { sql } from "drizzle-orm";
import { pgTable, text, jsonb, integer, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// Warehouse sections (Shipment Details "job", customs, invoicing, pick-up). Since migration 0015
// they belong to a warehouse POSITION (task_id), linked to a shipment or not; shipment_id is kept
// for information and for the Shipments view, which still reads them by shipment. Rows of
// shipments with no position yet (and the pick-up section, which Shipments enters and stays keyed
// to the shipment) have no task_id.
export const warehouseSectionTable = pgTable(
  "warehouse_section",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    taskId: uuid("task_id"),
    shipmentId: uuid("shipment_id"),
    section: text("section").notNull(), // WarehouseSection: "job" | "customs" | "pickup" | "invoicing"
    data: jsonb("data"),
    // Bumped by every save, so a client can tell the section changed since it was read.
    version: integer("version").notNull().default(0),
  },
  (table) => [
    ...defaultTableIndexes("warehouse_section", table),
    tenantIndex("warehouse_section", table),
    index("warehouse_section_shipment_id_idx").on(table.shipmentId),
    index("warehouse_section_task_id_idx").on(table.taskId),
    // One live section of a kind per position …
    uniqueIndex("warehouse_section_company_task_section_unique")
      .on(table.companyId, table.taskId, table.section)
      .where(sql`deleted_at IS NULL AND task_id IS NOT NULL`),
    // … and per shipment for rows without a position (legacy rows and pick-up).
    uniqueIndex("warehouse_section_company_shipment_section_unique")
      .on(table.companyId, table.shipmentId, table.section)
      .where(sql`deleted_at IS NULL AND task_id IS NULL`),
  ],
);

export type WarehouseSectionRecord = typeof warehouseSectionTable.$inferSelect;
export type NewWarehouseSectionRecord = typeof warehouseSectionTable.$inferInsert;
