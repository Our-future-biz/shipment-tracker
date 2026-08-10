import { pgTable, text, uuid, bigint, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { customerTable } from "./customer.schema";

export const customerDocumentTable = pgTable(
  "customer_document",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customerTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull().default("Other"), // Contract / NDA / Power of attorney / Customs / Other
    fileName: text("file_name").notNull().default(""),
    fileType: text("file_type").notNull().default(""),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    // File bytes stored as base64 data URL in Postgres (per storage decision)
    fileData: text("file_data").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("customer_document", table),
    tenantIndex("customer_document", table),
    index("customer_document_customer_id_idx").on(table.customerId),
  ],
);

export type CustomerDocumentRecord = typeof customerDocumentTable.$inferSelect;
export type NewCustomerDocumentRecord = typeof customerDocumentTable.$inferInsert;
