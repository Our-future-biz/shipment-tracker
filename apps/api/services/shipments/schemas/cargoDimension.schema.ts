import { pgTable, text, uuid, integer, boolean, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { shipmentTable } from "./shipment.schema";
import { containerTable } from "./container.schema";

// One dimension line (pieces of identical size/weight) of a shipment.
// containerId is null for shipments without containers (LCL/air). Volume per
// piece is derived (L×W×H/1e6) and never stored.
export const cargoDimensionTable = pgTable(
  "cargo_dimension",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull().references(() => shipmentTable.id, { onDelete: "cascade" }),
    containerId: uuid("container_id").references(() => containerTable.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    pieces: text("pieces").notNull().default(""),
    lengthCm: text("length_cm").notNull().default(""),
    widthCm: text("width_cm").notNull().default(""),
    heightCm: text("height_cm").notNull().default(""),
    // The unit the line was typed in ("cm" or "in"). The three sizes above are always stored
    // in cm (an inch value converted exactly, 1 in = 2.54 cm), so every volume sum stays
    // right; the unit only says how to show and edit them.
    dimensionUnit: text("dimension_unit").notNull().default("cm"),
    weightPerPcKg: text("weight_per_pc_kg").notNull().default(""),
    packageType: text("package_type").notNull().default(""),
    stackable: text("stackable").notNull().default(""),
    // Road freight: the pallet the pieces stand on, and ADR (dangerous goods) when it applies.
    palletType: text("pallet_type"),
    adrUn: text("adr_un"),
    adrClass: text("adr_class"),
    adrPackingGroup: text("adr_packing_group"),
    adrLimitedQuantity: boolean("adr_limited_quantity").notNull().default(false),
  },
  (table) => [
    ...defaultTableIndexes("cargo_dimension", table),
    tenantIndex("cargo_dimension", table),
    index("cargo_dimension_shipment_id_idx").on(table.shipmentId),
    index("cargo_dimension_container_id_idx").on(table.containerId),
    check("cargo_dimension_pallet_type_check", sql`${table.palletType} IN ('EUR', 'INDUSTRIAL', 'HALF', 'QUARTER', 'OTHER')`),
    check("cargo_dimension_adr_un_check", sql`${table.adrUn} ~ '^[0-9]{4}$'`),
    check("cargo_dimension_adr_packing_group_check", sql`${table.adrPackingGroup} IN ('I', 'II', 'III')`),
    check("cargo_dimension_dimension_unit_check", sql`${table.dimensionUnit} IN ('cm', 'in')`),
  ],
);

export type CargoDimensionRecord = typeof cargoDimensionTable.$inferSelect;
export type NewCargoDimensionRecord = typeof cargoDimensionTable.$inferInsert;
