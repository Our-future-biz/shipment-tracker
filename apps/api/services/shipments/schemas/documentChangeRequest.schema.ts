import { sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export type DocumentChangeRequestStatus = "pending" | "approved" | "rejected";

// A regular user asking to replace a document customs has approved: the new file waits here, the
// approved one staying in force, until a manager approves (the new file becomes the document, back
// at pending for customs) or rejects with a reason. A row is never written over - a new request is
// a new row - so every request and answer stays on record. At most one waits per document.
export const documentChangeRequestTable = pgTable(
  "document_change_request",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    shipmentId: uuid("shipment_id").notNull(),
    attachmentId: uuid("attachment_id").notNull(),
    // The approved document as it was when asked.
    fileName: text("file_name").notNull(),
    documentType: text("document_type").notNull().default(""),
    // The file that would replace it.
    newFileName: text("new_file_name").notNull(),
    newFileType: text("new_file_type").notNull().default(""),
    newFileSize: integer("new_file_size").notNull().default(0),
    newStorageKey: text("new_storage_key").notNull(),
    reason: text("reason").notNull(),
    status: text("status").$type<DocumentChangeRequestStatus>().notNull().default("pending"),
    // Who asked and who answered as named then: they stay named when they leave.
    requestedById: uuid("requested_by_id").notNull(),
    requestedByName: text("requested_by_name").notNull().default(""),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decidedById: uuid("decided_by_id"),
    decidedByName: text("decided_by_name").notNull().default(""),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    // Rejected: why (required); approved: optional.
    comment: text("comment").notNull().default(""),
    // When the one who asked opened the answer under the bell.
    answerSeenAt: timestamp("answer_seen_at", { withTimezone: true }),
  },
  (table) => [
    ...defaultTableIndexes("document_change_request", table),
    tenantIndex("document_change_request", table),
    index("document_change_request_shipment_id_idx").on(table.shipmentId),
    index("document_change_request_requested_by_idx").on(table.companyId, table.requestedById),
    uniqueIndex("document_change_request_one_pending_unique")
      .on(table.companyId, table.attachmentId)
      .where(sql`status = 'pending' AND deleted_at IS NULL`),
  ],
);

export type DocumentChangeRequestRecord = typeof documentChangeRequestTable.$inferSelect;
export type NewDocumentChangeRequestRecord = typeof documentChangeRequestTable.$inferInsert;
