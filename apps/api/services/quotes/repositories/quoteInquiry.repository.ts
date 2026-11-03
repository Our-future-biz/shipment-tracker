import { and, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { isUniqueViolation } from "../../../lib/db/errors";
import { db } from "../db/db";
import { quoteTable } from "../schemas/quote.schema";
import { quoteInquiryTable as t, type NewQuoteInquiryRecord, type QuoteInquiryKind, type QuoteInquiryRecord, type QuoteInquiryStatus } from "../schemas/quoteInquiry.schema";
import type { QuoteTransaction } from "./salesQuote.repository";

// The database, or the transaction that holds the quote's lock (so the quote and its question change together).
type Writer = typeof db | QuoteTransaction;

const live = (companyId: string) => and(eq(t.companyId, companyId), isNull(t.deletedAt));
const margin = eq(t.kind, "margin");

/** A warehouse question with the facts of its quote the warehouse needs (null: the quote is gone). */
export interface WarehouseInquiryWithQuote {
  inquiry: QuoteInquiryRecord;
  quote: {
    quoteNumber: string;
    status: string | null;
    ownerUserId: string | null;
    ownerLabel: string;
    customerName: string;
    serviceType: string;
    from: string;
    to: string;
    /** The question the quote holds (data.warehouseInquiry): its recorded names stand in for a user who left. */
    recorded: unknown;
  } | null;
}

// What a warehouse question's quote says, read with it (the document's text fields).
const quoteFacts = {
  quoteNumber: quoteTable.quoteNumber,
  status: quoteTable.status,
  ownerUserId: quoteTable.ownerUserId,
  ownerLabel: quoteTable.ownerLabel,
  customerName: sql<string>`coalesce(${quoteTable.data}->>'customerName', '')`,
  serviceType: sql<string>`coalesce(${quoteTable.data}->>'serviceType', '')`,
  from: sql<string>`coalesce(nullif(${quoteTable.data}->>'pol', ''), ${quoteTable.data}->>'origin', '')`,
  to: sql<string>`coalesce(nullif(${quoteTable.data}->>'pod', ''), ${quoteTable.data}->>'destination', '')`,
  recorded: sql<unknown>`${quoteTable.data}->'warehouseInquiry'`,
};

// The questions a rep asks a manager about a quote (schemas/quoteInquiry). Rows are only ever
// added and answered, never written over: a new question is a new row.
class QuoteInquiryRepository {
  /** Stores a new question; null when one of its kind already waits on the quote. */
  async insert(row: NewQuoteInquiryRecord, writer: Writer = db): Promise<QuoteInquiryRecord | null> {
    try {
      const [created] = await writer.insert(t).values(row).returning();
      return created ?? null;
    } catch (err) {
      if (isUniqueViolation(err)) return null;
      throw err;
    }
  }

  /** The question of a kind on a quote that waits for an answer, when there is one. */
  async pendingOf(companyId: string, quoteId: string, writer: Writer = db, kind: QuoteInquiryKind = "margin"): Promise<QuoteInquiryRecord | null> {
    const [row] = await writer.select().from(t).where(and(live(companyId), eq(t.kind, kind), eq(t.quoteId, quoteId), eq(t.status, "pending"))).limit(1);
    return row ?? null;
  }

  /** The newest margin question of a quote, answered or not. */
  async latestOf(companyId: string, quoteId: string): Promise<QuoteInquiryRecord | null> {
    const [row] = await db.select().from(t).where(and(live(companyId), margin, eq(t.quoteId, quoteId))).orderBy(desc(t.requestedAt)).limit(1);
    return row ?? null;
  }

  /**
   * Answers a waiting question, only while it still waits - so of two managers answering at the
   * same moment one wins and the other is told. Null when it no longer waits.
   */
  async answer(companyId: string, id: string, patch: Partial<NewQuoteInquiryRecord> & { status: QuoteInquiryStatus }, writer: Writer = db): Promise<QuoteInquiryRecord | null> {
    const [row] = await writer
      .update(t)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(live(companyId), eq(t.id, id), eq(t.status, "pending")))
      .returning();
    return row ?? null;
  }

  async byId(companyId: string, id: string): Promise<QuoteInquiryRecord | null> {
    const [row] = await db.select().from(t).where(and(live(companyId), eq(t.id, id))).limit(1);
    return row ?? null;
  }

  /** Waiting margin questions, and those answered or withdrawn since `answeredSince`, the newest first. */
  async list(companyId: string, answeredSince: Date, limit: number): Promise<QuoteInquiryRecord[]> {
    return db
      .select()
      .from(t)
      .where(and(live(companyId), margin, or(eq(t.status, "pending"), gte(t.updatedAt, answeredSince))))
      .orderBy(desc(t.requestedAt))
      .limit(limit);
  }

  /** Margin questions asked, answered or withdrawn since `since`: the cockpit's audit line. */
  async marginSince(companyId: string, since: Date): Promise<QuoteInquiryRecord[]> {
    return db.select().from(t).where(and(live(companyId), margin, or(gte(t.requestedAt, since), gte(t.updatedAt, since))));
  }

  /** Margin answers since `since` that nobody opened, with whom the question's quote belongs to. */
  async unseenMarginAnswers(companyId: string, since: Date): Promise<{ quoteNumber: string; requestedById: string; ownerUserId: string | null }[]> {
    return db
      .select({ quoteNumber: t.quoteNumber, requestedById: t.requestedById, ownerUserId: quoteTable.ownerUserId })
      .from(t)
      .leftJoin(quoteTable, and(eq(quoteTable.id, t.quoteId), eq(quoteTable.companyId, t.companyId)))
      .where(and(live(companyId), margin, inArray(t.status, ["approved", "rejected"]), gte(t.decidedAt, since), isNull(t.answerSeenAt)));
  }

  /** The company's waiting margin questions. */
  async pending(companyId: string): Promise<QuoteInquiryRecord[]> {
    return db.select().from(t).where(and(live(companyId), margin, eq(t.status, "pending"))).orderBy(t.requestedAt);
  }

  /** Warehouse questions waiting, and those answered since `answeredSince`, the newest question first; at most `limit`. */
  async listWarehouse(companyId: string, answeredSince: Date, limit: number): Promise<WarehouseInquiryWithQuote[]> {
    return db
      .select({ inquiry: t, quote: quoteFacts })
      .from(t)
      .leftJoin(quoteTable, and(eq(quoteTable.id, t.quoteId), eq(quoteTable.companyId, t.companyId), isNull(quoteTable.deletedAt)))
      .where(and(live(companyId), eq(t.kind, "warehouse_heavy"), or(eq(t.status, "pending"), gte(t.decidedAt, answeredSince))))
      .orderBy(desc(t.requestedAt))
      .limit(limit);
  }

  /** The warehouse's answers to `userId`'s questions: not opened yet, or opened since `seenSince`. */
  async warehouseAnswersFor(companyId: string, userId: string, seenSince: Date, limit: number): Promise<WarehouseInquiryWithQuote[]> {
    return db
      .select({ inquiry: t, quote: quoteFacts })
      .from(t)
      .leftJoin(quoteTable, and(eq(quoteTable.id, t.quoteId), eq(quoteTable.companyId, t.companyId), isNull(quoteTable.deletedAt)))
      .where(
        and(
          live(companyId),
          eq(t.kind, "warehouse_heavy"),
          eq(t.requestedById, userId),
          inArray(t.status, ["approved", "rejected"]),
          or(isNull(t.answerSeenAt), gte(t.answerSeenAt, seenSince)),
        ),
      )
      .orderBy(desc(t.decidedAt))
      .limit(limit);
  }

  /**
   * Answers for `userId`'s bell: of questions they asked, or on quotes they own, answered since
   * `since`; those opened before `seenSince` are left out.
   */
  async answersFor(companyId: string, userId: string, since: Date, seenSince: Date, limit: number): Promise<QuoteInquiryRecord[]> {
    const rows = await db
      .select({ inquiry: t })
      .from(t)
      .leftJoin(quoteTable, and(eq(quoteTable.id, t.quoteId), eq(quoteTable.companyId, t.companyId)))
      .where(
        and(
          live(companyId),
          margin,
          inArray(t.status, ["approved", "rejected"]),
          gte(t.decidedAt, since),
          or(eq(t.requestedById, userId), eq(quoteTable.ownerUserId, userId)),
          // The one who answered is not told their own answer.
          ne(t.decidedById, userId),
          or(isNull(t.answerSeenAt), gte(t.answerSeenAt, seenSince)),
        ),
      )
      .orderBy(desc(t.decidedAt))
      .limit(limit);
    return rows.map((r) => r.inquiry);
  }

  /**
   * Writes a warehouse question as the quote now holds it (data.warehouseInquiry), in the same
   * transaction as the quote: asked, answered or opened. The row has the question's id.
   */
  async recordWarehouse(row: NewQuoteInquiryRecord & { id: string }, writer: Writer = db): Promise<void> {
    await writer
      .insert(t)
      .values(row)
      .onConflictDoUpdate({
        target: t.id,
        set: {
          status: row.status,
          decision: row.decision ?? null,
          decidedById: row.decidedById ?? null,
          decidedAt: row.decidedAt ?? null,
          comment: row.comment ?? "",
          details: row.details,
          answerSeenAt: row.answerSeenAt ?? null,
          updatedAt: new Date(),
        },
      });
  }

  /** Marks the answers as opened by whoever they are for. */
  async markSeen(companyId: string, ids: string[], at: Date): Promise<void> {
    if (!ids.length) return;
    await db
      .update(t)
      .set({ answerSeenAt: at })
      .where(and(live(companyId), inArray(t.id, ids), isNull(t.answerSeenAt), sql`${t.decidedAt} IS NOT NULL`));
  }
}

export const quoteInquiryRepository = new QuoteInquiryRepository();
