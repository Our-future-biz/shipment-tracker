import { bigint, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { masterJobTable } from "./masterJob.schema";

// A file on a master job's Documents tab. Master job documents are a store of their own, apart from
// the shipments' documents (shipment_attachment): linking or unlinking a house never moves one, and
// neither side reads the other. The bytes live in the master-job-documents bucket under storage_key.
export const masterJobDocumentTable = pgTable(
  "master_job_document",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    masterJobId: uuid("master_job_id").notNull().references(() => masterJobTable.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    fileType: text("file_type").notNull().default(""),
    storageKey: text("storage_key").notNull().default(""),
    /** Business document type (Bill of Lading, Booking confirmation, …), chosen before the file is added. */
    documentType: text("document_type").notNull().default(""),
    /** Who added the file. */
    uploadedById: uuid("uploaded_by_id"),
  },
  (table) => [
    ...defaultTableIndexes("master_job_document", table),
    tenantIndex("master_job_document", table),
    index("master_job_document_master_job_id_idx").on(table.masterJobId),
  ],
);

export type MasterJobDocumentRecord = typeof masterJobDocumentTable.$inferSelect;
export type NewMasterJobDocumentRecord = typeof masterJobDocumentTable.$inferInsert;
