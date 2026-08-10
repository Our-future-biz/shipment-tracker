import { pgTable, text, bigint, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

export const quoteAttachmentTable = pgTable(
  "quote_attachment",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    quoteNumber: text("quote_number").notNull(),
    fileName: text("file_name").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull().default(0),
    fileType: text("file_type").notNull().default(""),
    storageKey: text("storage_key").notNull().default(""),
  },
  (table) => [
    ...defaultTableIndexes("quote_attachment", table),
    tenantIndex("quote_attachment", table),
    index("quote_attachment_quote_number_idx").on(table.quoteNumber),
  ],
);

export type QuoteAttachmentRecord = typeof quoteAttachmentTable.$inferSelect;
export type NewQuoteAttachmentRecord = typeof quoteAttachmentTable.$inferInsert;
