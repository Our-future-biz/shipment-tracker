import { sql } from "drizzle-orm";
import { pgTable, text, uuid, index, timestamp, unique } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";

// A quote's internal conversation, as the shipments chat. One thread per Sales Reference: a
// revision (QCZ…001-R1, -R2) shares the thread of the quote it revises (QCZ…001), so everything
// said about the quote is in one place whichever revision is open. `threadRef` is that original
// reference (salesReference revisionRoot); `quoteNumber` is the one the message was written on.
export const quoteCommentTable = pgTable(
  "quote_comment",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    threadRef: text("thread_ref").notNull(),
    quoteNumber: text("quote_number").notNull(),
    authorId: uuid("author_id").notNull(),
    message: text("message").notNull(),
    /** Colleagues tagged with @ in the message; each gets a notification until they open the chat. */
    mentionedUserIds: uuid("mentioned_user_ids").array().notNull().default(sql`'{}'::uuid[]`),
  },
  (table) => [
    ...defaultTableIndexes("quote_comment", table),
    tenantIndex("quote_comment", table),
    index("quote_comment_company_thread_idx").on(table.companyId, table.threadRef, table.createdAt),
    // "Messages that tag me" (polled by the bell): mentioned_user_ids @> '{me}'.
    index("quote_comment_mentioned_user_ids_idx").using("gin", table.mentionedUserIds),
  ],
);

// How far each user has read a quote's thread; what came later counts as unread.
export const quoteCommentReadTable = pgTable(
  "quote_comment_read",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    threadRef: text("thread_ref").notNull(),
    userId: uuid("user_id").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    ...defaultTableIndexes("quote_comment_read", table),
    tenantIndex("quote_comment_read", table),
    index("quote_comment_read_user_idx").on(table.companyId, table.userId),
    unique("quote_comment_read_user_thread_uq").on(table.companyId, table.userId, table.threadRef),
  ],
);

export type QuoteCommentRecord = typeof quoteCommentTable.$inferSelect;
export type NewQuoteCommentRecord = typeof quoteCommentTable.$inferInsert;
