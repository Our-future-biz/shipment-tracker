import { pgTable, text, uuid, integer, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// One commercial cargo line (goods description) of a shipment. containerId is
// null for shipments without containers (LCL/air) — those lines belong to the
// shipment directly. Deliberately has no volume: volume only exists on
// cargo_dimension rows.
export const cargoItemTable = pgTable(
  "cargo_item",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    containerId: uuid("container_id"),
    position: integer("position").notNull().default(0),
    cargoDescription: text("cargo_description").notNull().default(""),
    hsCode: text("hs_code").notNull().default(""),
    pieces: text("pieces").notNull().default(""),
    packageType: text("package_type").notNull().default(""),
    grossWeight: text("gross_weight").notNull().default(""),
    commercialInvoiceValue: text("commercial_invoice_value").notNull().default(""),
    currency: text("currency").notNull().default("USD"),
  },
  (table) => [
    ...defaultTableIndexes("cargo_item", table),
    tenantIndex("cargo_item", table),
    index("cargo_item_shipment_id_idx").on(table.shipmentId),
    index("cargo_item_container_id_idx").on(table.containerId),
  ],
);

export type CargoItemRecord = typeof cargoItemTable.$inferSelect;
export type NewCargoItemRecord = typeof cargoItemTable.$inferInsert;
