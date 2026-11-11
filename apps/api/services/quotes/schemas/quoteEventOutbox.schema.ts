import { sql } from "drizzle-orm";
import { pgTable, uuid, jsonb, index } from "drizzle-orm/pg-core";
import { defaultTableColumns, defaultTableIndexes, tenantColumns, tenantIndex } from "../../../lib/db/defaults";
import { outboxColumns, outboxStatusCheck } from "../../../lib/outbox/outbox.columns";
import type { QuoteRenamedEvent } from "../topics";

// One `quote-renamed` event owed by a rename (lib/salesReference letters), written in the rename's own
// transaction and published after the commit (straight away, then by the quotes-event-outbox cron with
// retries): the copies in shipments, invoicing, trucking, customers and sales always hear of it.
export const quoteEventOutboxTable = pgTable(
  "quote_event_outbox",
  {
    ...defaultTableColumns,
    ...tenantColumns,
    // The quote renamed: its renames go out in the order they were made.
    quoteId: uuid("quote_id").notNull(),
    event: jsonb("event").$type<QuoteRenamedEvent>().notNull(),
    ...outboxColumns,
  },
  (table) => [
    ...defaultTableIndexes("quote_event_outbox", table),
    tenantIndex("quote_event_outbox", table),
    index("quote_event_outbox_due_idx").on(table.nextAttemptAt).where(sql`status = 'pending'`),
    index("quote_event_outbox_quote_idx").on(table.quoteId, table.createdAt),
    outboxStatusCheck("quote_event_outbox_status_check", table),
  ],
);

export type QuoteEventOutboxRecord = typeof quoteEventOutboxTable.$inferSelect;
