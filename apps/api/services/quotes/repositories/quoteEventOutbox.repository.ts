import { asc, inArray, sql } from "drizzle-orm";
import { db } from "../db/db";
import { quoteEventOutboxTable, type QuoteEventOutboxRecord } from "../schemas/quoteEventOutbox.schema";
import { OutboxRepository } from "../../../lib/outbox/outboxRepository";

const o = quoteEventOutboxTable;

// The quote-renamed events renames owe (schemas/quoteEventOutbox). Claiming and settling come from the
// shared OutboxRepository; one quote's renames go out in order.
class QuoteEventOutboxRepository extends OutboxRepository<typeof quoteEventOutboxTable> {
  constructor() {
    super(db, quoteEventOutboxTable, "quote_event_outbox", { orderKey: "quote_id", sentAfterCancelNote: "published just before it was cancelled" });
  }

  // Takes up to `limit` due rows; with `quoteId`, only that quote's (the publish straight after its rename).
  async claimDue(limit: number, quoteId?: string): Promise<QuoteEventOutboxRecord[]> {
    const ids = await this.claimDueRows(limit, quoteId ? sql`AND x.quote_id = ${quoteId}` : sql``);
    if (!ids.length) return [];
    return db.select().from(o).where(inArray(o.id, ids)).orderBy(asc(o.createdAt), asc(o.id));
  }
}

export const quoteEventOutboxRepository = new QuoteEventOutboxRepository();
