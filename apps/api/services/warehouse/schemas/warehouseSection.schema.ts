import { sql } from "drizzle-orm";
import { pgTable, text, uuid, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export const warehouseSectionTable = pgTable(
  "warehouse_section",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    section: text("section").notNull(), // WarehouseSection: "job" | "customs" | "pickup" | "invoicing"
    data: jsonb("data"),
  },
  (table) => [
    ...defaultTableIndexes("warehouse_section", table),
    tenantIndex("warehouse_section", table),
    index("warehouse_section_shipment_id_idx").on(table.shipmentId),
    // One live row per section of a shipment; a deleted one doesn't block its replacement.
    uniqueIndex("warehouse_section_shipment_section_idx")
      .on(table.companyId, table.shipmentId, table.section)
      .where(sql`deleted_at IS NULL`),
  ],
);

export type WarehouseSectionRecord = typeof warehouseSectionTable.$inferSelect;
export type NewWarehouseSectionRecord = typeof warehouseSectionTable.$inferInsert;
