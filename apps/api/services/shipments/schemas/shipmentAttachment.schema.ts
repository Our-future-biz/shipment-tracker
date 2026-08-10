import { pgTable, text, uuid, bigint, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export const shipmentAttachmentTable = pgTable(
  "shipment_attachment",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    fileName: text("file_name").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    fileType: text("file_type").notNull().default(""),
    storageKey: text("storage_key").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("shipment_attachment", table),
    tenantIndex("shipment_attachment", table),
    index("shipment_attachment_shipment_id_idx").on(table.shipmentId),
  ],
);

export type ShipmentAttachmentRecord = typeof shipmentAttachmentTable.$inferSelect;
export type NewShipmentAttachmentRecord = typeof shipmentAttachmentTable.$inferInsert;
