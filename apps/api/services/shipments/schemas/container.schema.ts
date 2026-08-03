import { pgTable, text, uuid, integer, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes } from "../../../lib/db/defaults";

export const containerTable = pgTable(
  "container",
  {
    ...defaultTableColumns,
    shipmentId: uuid("shipment_id").notNull(),
    position: integer("position").notNull().default(0),
    containerNumber: text("container_number").notNull().default(""),
    sealNumber: text("seal_number").notNull().default(""),
    type: text("type").notNull().default(""),
    teu: text("teu").notNull().default(""),
    packages: text("packages").notNull().default(""),
    packageType: text("package_type").notNull().default(""),
    grossWeight: text("gross_weight").notNull().default(""),
    volume: text("volume").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("container", table),
    index("container_shipment_id_idx").on(table.shipmentId),
  ],
);

export type ContainerRecord = typeof containerTable.$inferSelect;
export type NewContainerRecord = typeof containerTable.$inferInsert;
