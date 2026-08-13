import { pgTable, text, uuid, integer, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// One dimension line (pieces of identical size/weight) of a shipment.
// containerId is null for shipments without containers (LCL/air). Volume per
// piece is derived (L×W×H/1e6) and never stored.
export const cargoDimensionTable = pgTable(
  "cargo_dimension",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    containerId: uuid("container_id"),
    position: integer("position").notNull().default(0),
    pieces: text("pieces").notNull().default(""),
    lengthCm: text("length_cm").notNull().default(""),
    widthCm: text("width_cm").notNull().default(""),
    heightCm: text("height_cm").notNull().default(""),
    weightPerPcKg: text("weight_per_pc_kg").notNull().default(""),
    packageType: text("package_type").notNull().default(""),
    stackable: text("stackable").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("cargo_dimension", table),
    tenantIndex("cargo_dimension", table),
    index("cargo_dimension_shipment_id_idx").on(table.shipmentId),
    index("cargo_dimension_container_id_idx").on(table.containerId),
  ],
);

export type CargoDimensionRecord = typeof cargoDimensionTable.$inferSelect;
export type NewCargoDimensionRecord = typeof cargoDimensionTable.$inferInsert;
