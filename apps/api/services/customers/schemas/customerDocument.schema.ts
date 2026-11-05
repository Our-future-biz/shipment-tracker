import { sql } from "drizzle-orm";
import { pgTable, text, uuid, bigint, date, index, check } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { customerTable } from "./customer.schema";
import type { DocumentType } from "../interfaces/interfaces";

export const customerDocumentTable = pgTable(
  "customer_document",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customerTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").$type<DocumentType>().notNull().default("Other"),
    fileName: text("file_name").notNull().default(""),
    fileType: text("file_type").notNull().default(""),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    // File bytes stored as base64 data URL in Postgres (per storage decision)
    fileData: text("file_data").notNull().default(""),
    // The day it is valid to (a supplier's insurance, licence, certificate); null when it does not end.
    validTo: date("valid_to", { mode: "string" }),
  },
  (table) => [
    ...defaultTableIndexes("customer_document", table),
    tenantIndex("customer_document", table),
    index("customer_document_customer_id_idx").on(table.customerId),
    check(
      "customer_document_type_check",
      sql`${table.type} IN ('Contract', 'NDA', 'Power of attorney', 'Customs', 'Other', 'Carrier liability insurance', 'Transport licence', 'Framework agreement', 'Certificate')`,
    ),
  ],
);

export type CustomerDocumentRecord = typeof customerDocumentTable.$inferSelect;
export type NewCustomerDocumentRecord = typeof customerDocumentTable.$inferInsert;
