import { pgTable, text, bigint, index, uuid } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { quoteCommentTable } from "./quoteComment.schema";

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
    // A file sent in the quote's chat: the message it went with (its quoteNumber is then the
    // thread's original reference). Null for an upload not sent yet.
    commentId: uuid("comment_id").references(() => quoteCommentTable.id, { onDelete: "set null" }),
  },
  (table) => [
    ...defaultTableIndexes("quote_attachment", table),
    tenantIndex("quote_attachment", table),
    // Attachments are always looked up within a company (quote numbers repeat across companies).
    index("quote_attachment_company_quote_number_idx").on(table.companyId, table.quoteNumber),
    index("quote_attachment_comment_id_idx").on(table.commentId),
  ],
);

export type QuoteAttachmentRecord = typeof quoteAttachmentTable.$inferSelect;
export type NewQuoteAttachmentRecord = typeof quoteAttachmentTable.$inferInsert;
