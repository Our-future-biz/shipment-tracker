import { pgTable, text, uuid, bigint, index, timestamp } from "drizzle-orm/pg-core";
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
    /** Business document type: Invoice, Packing list, Bill of Lading, … ("" = not classified yet). */
    documentType: text("document_type").notNull().default(""),
    /** Customs review: "" (pending) | approved | declined. */
    customsStatus: text("customs_status").notNull().default(""),
    /** Reason shown to operations when a document is declined. */
    customsNote: text("customs_note").notNull().default(""),
    customsReviewedAt: timestamp("customs_reviewed_at", { withTimezone: true }),
    customsReviewedById: uuid("customs_reviewed_by_id"),
  },
  (table) => [
    ...defaultTableIndexes("shipment_attachment", table),
    tenantIndex("shipment_attachment", table),
    index("shipment_attachment_shipment_id_idx").on(table.shipmentId),
  ],
);

export type ShipmentAttachmentRecord = typeof shipmentAttachmentTable.$inferSelect;
export type NewShipmentAttachmentRecord = typeof shipmentAttachmentTable.$inferInsert;
