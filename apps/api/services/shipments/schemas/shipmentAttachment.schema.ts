import { sql } from "drizzle-orm";
import { pgTable, text, uuid, bigint, index, timestamp, check, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { shipmentTable } from "./shipment.schema";
import { shipmentCommentTable } from "./shipmentComment.schema";
import type { AttachmentCustomsStatus } from "../interfaces/interfaces";

export const shipmentAttachmentTable = pgTable(
  "shipment_attachment",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull().references(() => shipmentTable.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    fileType: text("file_type").notNull().default(""),
    storageKey: text("storage_key").notNull().default(""),
    /** Who uploaded the file. Null on rows created before this was recorded. */
    uploadedById: uuid("uploaded_by_id"),
    /** Chat message the file was sent with; null for files added on the Documents tab. */
    commentId: uuid("comment_id").references(() => shipmentCommentTable.id, { onDelete: "set null" }),
    /** Business document type: Invoice, Packing list, Bill of Lading, … ("" = not classified yet). */
    documentType: text("document_type").notNull().default(""),
    /** Customs review: "" (pending) | approved | declined. */
    customsStatus: text("customs_status").$type<AttachmentCustomsStatus>().notNull().default(""),
    /** Reason shown to operations when a document is declined. */
    customsNote: text("customs_note").notNull().default(""),
    customsReviewedAt: timestamp("customs_reviewed_at", { withTimezone: true }),
    customsReviewedById: uuid("customs_reviewed_by_id"),
    /** What another module handed this file over as ("trucking:<sha256>"), so a retry adds no second copy; "" for an upload. */
    sourceRef: text("source_ref").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("shipment_attachment", table),
    tenantIndex("shipment_attachment", table),
    index("shipment_attachment_shipment_id_idx").on(table.shipmentId),
    index("shipment_attachment_comment_id_idx").on(table.commentId),
    uniqueIndex("shipment_attachment_source_ref_uq").on(table.companyId, table.shipmentId, table.sourceRef).where(sql`source_ref <> '' AND deleted_at IS NULL`),
    check("shipment_attachment_customs_status_check", sql`${table.customsStatus} IN ('', 'approved', 'declined')`),
  ],
);

export type ShipmentAttachmentRecord = typeof shipmentAttachmentTable.$inferSelect;
export type NewShipmentAttachmentRecord = typeof shipmentAttachmentTable.$inferInsert;
