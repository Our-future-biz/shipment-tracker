import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/db";
import { quoteTable, type SalesQuoteRecord } from "../schemas/quote.schema";
import { quoteCommentTable } from "../schemas/quoteComment.schema";
import { quoteInquiryTable } from "../schemas/quoteInquiry.schema";
import { quoteRefSequenceTable } from "../schemas/quoteRefSequence.schema";
import { quoteEventOutboxTable } from "../schemas/quoteEventOutbox.schema";

// A quote's reference takes the letters of its Freight Mode (lib/salesReference) while it is open.
// This moves a live quote from one reference to the other, in one transaction, with what this
// service keeps under it: the reference in its own document, the quote it replaced pointing at it
// (replacedBy), the messages written on it, its inquiries and its counter row. The chat - its read
// marks and its files - is kept under its thread, which has no letters (quoteThreadOf), and the
// history keeps the references it was written with. Other services follow the quote-renamed event.

class QuoteRenameRepository {
  /** Renames the live quote `from` to `to`; null, writing nothing, when no live quote is `from` any more. */
  async rename(companyId: string, from: string, to: string): Promise<SalesQuoteRecord | null> {
    return db.transaction(async (tx) => {
      const [renamed] = await tx
        .update(quoteTable)
        .set({
          quoteNumber: to,
          // The document's own reference (a server key: no save brings the old one back).
          data: sql`CASE WHEN jsonb_typeof(${quoteTable.data}) = 'object' AND ${quoteTable.data} ? 'reference'
            THEN jsonb_set(${quoteTable.data}, '{reference}', to_jsonb(${to}::text)) ELSE ${quoteTable.data} END`,
        })
        .where(and(eq(quoteTable.companyId, companyId), eq(quoteTable.quoteNumber, from), isNull(quoteTable.deletedAt)))
        .returning();
      if (!renamed) return null;

      // The quote this one replaced names it as its revision.
      await tx
        .update(quoteTable)
        .set({ data: sql`jsonb_set(${quoteTable.data}, '{replacedBy}', to_jsonb(${to}::text))` })
        .where(and(eq(quoteTable.companyId, companyId), sql`jsonb_typeof(${quoteTable.data}) = 'object'`, sql`${quoteTable.data} ->> 'replacedBy' = ${from}`));
      await tx
        .update(quoteCommentTable)
        .set({ quoteNumber: to })
        .where(and(eq(quoteCommentTable.companyId, companyId), eq(quoteCommentTable.quoteNumber, from)));
      await tx
        .update(quoteInquiryTable)
        .set({ quoteNumber: to })
        .where(and(eq(quoteInquiryTable.companyId, companyId), eq(quoteInquiryTable.quoteNumber, from)));
      await tx
        .update(quoteRefSequenceTable)
        .set({ quoteNumber: to })
        .where(and(eq(quoteRefSequenceTable.companyId, companyId), eq(quoteRefSequenceTable.quoteNumber, from)));
      // The event the other services follow, owed with the rename (published after the commit).
      await tx.insert(quoteEventOutboxTable).values({ companyId, quoteId: renamed.id, event: { companyId, from, to }, actingUserId: "", actingRole: "", createdAt: sql`clock_timestamp()` });
      return renamed as SalesQuoteRecord;
    });
  }
}

export const quoteRenameRepository = new QuoteRenameRepository();
