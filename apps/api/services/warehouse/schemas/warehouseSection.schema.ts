import { pgTable, text, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";

export const warehouseSectionTable = pgTable(
  "warehouse_section",
  {
    ...defaultTableColumns,
    shipmentId: text("shipment_id").notNull(),
    section: text("section").notNull(), // "job" | "customs" | "pickup" | "invoicing"
    data: jsonb("data"),
  },
  (table) => [
    ...defaultTableIndexes("warehouse_section", table),
    index("warehouse_section_shipment_id_idx").on(table.shipmentId),
    uniqueIndex("warehouse_section_shipment_section_idx").on(table.shipmentId, table.section),
  ],
);

export type WarehouseSectionRecord = typeof warehouseSectionTable.$inferSelect;
export type NewWarehouseSectionRecord = typeof warehouseSectionTable.$inferInsert;
