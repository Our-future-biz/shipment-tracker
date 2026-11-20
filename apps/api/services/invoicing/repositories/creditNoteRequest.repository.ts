import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { db } from "../db/db";
import { lockInvoiceRow } from "./invoice.repository";
import { creditNoteRequestTable as t, type CreditNoteRequestRecord, type NewCreditNoteRequestRecord } from "../schemas/creditNoteRequest.schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = typeof db | Tx;

// Taken back by the app, not by the one who asked: the invoice was credited or cancelled meanwhile, and the
// comment says how (services/invoiceDocument). Unlike a request taken back by hand, it is news to whoever
// asked and part of the managers' record (user council B5): a withdrawal by hand carries no comment.
const withdrawnByTheApp = and(eq(t.status, "withdrawn"), ne(t.comment, ""));

/** Requests to credit an invoice in part (schemas/creditNoteRequest), and their answers. */
class CreditNoteRequestRepository {
  /**
   * A new request; null when one already waits for this invoice. Under the invoice's row lock (mock council S5-4 /
   * X-3), with `guard` - the check that no change of it waits - run again there, so a change asked at the same
   * moment is seen: only one of the two gets in.
   */
  async create(values: NewCreditNoteRequestRecord, guard?: (tx: Tx) => Promise<void>): Promise<CreditNoteRequestRecord | null> {
    return db.transaction(async (tx) => {
      await lockInvoiceRow(tx, values.companyId, values.invoiceId);
      await guard?.(tx);
      const [row] = await tx.insert(t).values(values).onConflictDoNothing().returning();
      return row ?? null;
    });
  }

  async byId(companyId: string, id: string, reader: Reader = db): Promise<CreditNoteRequestRecord | null> {
    const [row] = await reader.select().from(t).where(and(eq(t.id, id), eq(t.companyId, companyId), isNull(t.deletedAt))).limit(1);
    return row ?? null;
  }

  /** The request waiting for this invoice, if any. */
  async pendingFor(companyId: string, invoiceId: string, reader: Reader = db): Promise<CreditNoteRequestRecord | null> {
    const [row] = await reader
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.invoiceId, invoiceId), eq(t.status, "pending"), isNull(t.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  /** Approves a waiting request with the credit note it issued; null when it no longer waits. */
  async approve(
    tx: Tx,
    companyId: string,
    id: string,
    by: { userId: string; userEmail: string; comment: string },
    creditNote: { id: string; number: string },
  ): Promise<CreditNoteRequestRecord | null> {
    const now = new Date();
    const [row] = await tx
      .update(t)
      .set({
        status: "approved",
        decidedById: by.userId,
        decidedByName: by.userEmail,
        decidedAt: now,
        comment: by.comment,
        creditNoteId: creditNote.id,
        creditNoteNumber: creditNote.number,
        updatedAt: now,
      })
      .where(and(eq(t.id, id), eq(t.companyId, companyId), eq(t.status, "pending"), isNull(t.deletedAt)))
      .returning();
    if (!row) return null;
    // The manager who answered is the one who asked: allowed, and shown.
    if (row.requestedById === by.userId) {
      const [own] = await tx.update(t).set({ selfDecision: true }).where(eq(t.id, row.id)).returning();
      return own ?? row;
    }
    return row;
  }

  /** Rejects a waiting request; null when it no longer waits. */
  async reject(companyId: string, id: string, by: { userId: string; userEmail: string; comment: string }): Promise<CreditNoteRequestRecord | null> {
    const now = new Date();
    const [row] = await db
      .update(t)
      .set({ status: "rejected", decidedById: by.userId, decidedByName: by.userEmail, decidedAt: now, comment: by.comment, updatedAt: now })
      .where(and(eq(t.id, id), eq(t.companyId, companyId), eq(t.status, "pending"), isNull(t.deletedAt)))
      .returning();
    if (!row) return null;
    if (row.requestedById === by.userId) {
      const [own] = await db.update(t).set({ selfDecision: true }).where(eq(t.id, row.id)).returning();
      return own ?? row;
    }
    return row;
  }

  /** Takes one waiting request back; null when it no longer waits. */
  async withdraw(companyId: string, id: string, by: { id: string; name: string }, reader: Reader = db, comment = ""): Promise<CreditNoteRequestRecord | null> {
    const [row] = await reader
      .update(t)
      .set({ status: "withdrawn", decidedById: by.id, decidedByName: by.name, decidedAt: new Date(), comment, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.companyId, companyId), eq(t.status, "pending"), isNull(t.deletedAt)))
      .returning();
    return row ?? null;
  }

  /** The request waiting for an invoice that was just credited to its end: nothing is left to credit in part. */
  async withdrawForInvoice(tx: Tx, companyId: string, invoiceId: string, by: { id: string; name: string }, comment: string): Promise<void> {
    const now = new Date();
    await tx
      .update(t)
      .set({ status: "withdrawn", decidedById: by.id, decidedByName: by.name, decidedAt: now, comment, updatedAt: now })
      .where(and(eq(t.companyId, companyId), eq(t.invoiceId, invoiceId), eq(t.status, "pending"), isNull(t.deletedAt)));
  }

  /** The managers' list: what waits, and what was answered (or taken back by the app) since `since`; not what its asker took back. */
  async list(companyId: string, since: Date, limit: number): Promise<CreditNoteRequestRecord[]> {
    return db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), isNull(t.deletedAt), or(eq(t.status, "pending"), and(or(ne(t.status, "withdrawn"), withdrawnByTheApp), gte(t.decidedAt, since)))))
      .orderBy(desc(t.requestedAt))
      .limit(limit);
  }

  /** What waits for a manager, newest first (the bell). */
  async pending(companyId: string, limit: number): Promise<CreditNoteRequestRecord[]> {
    return db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.status, "pending"), isNull(t.deletedAt)))
      .orderBy(desc(t.requestedAt))
      .limit(limit);
  }

  /**
   * Answers to what this user asked (a withdrawal by the app too), for their bell: unread ones since
   * `since`, read ones since `seenSince`. The one who answered is not told their own answer.
   */
  async answersFor(companyId: string, userId: string, since: Date, seenSince: Date, limit: number): Promise<CreditNoteRequestRecord[]> {
    return db
      .select()
      .from(t)
      .where(
        and(
          eq(t.companyId, companyId),
          isNull(t.deletedAt),
          eq(t.requestedById, userId),
          or(inArray(t.status, ["approved", "rejected"]), withdrawnByTheApp),
          ne(t.decidedById, userId),
          gte(t.decidedAt, since),
          or(isNull(t.answerSeenAt), gte(t.answerSeenAt, seenSince)),
        ),
      )
      .orderBy(desc(t.decidedAt))
      .limit(limit);
  }

  async markSeen(companyId: string, userId: string, ids: string[], at: Date): Promise<void> {
    if (!ids.length) return;
    await db
      .update(t)
      .set({ answerSeenAt: at })
      .where(and(eq(t.companyId, companyId), eq(t.requestedById, userId), inArray(t.id, ids), isNull(t.answerSeenAt), isNotNull(t.decidedAt)));
  }

  /** A shipment's requests, newest first. */
  async ofShipment(companyId: string, shipmentId: string): Promise<CreditNoteRequestRecord[]> {
    return db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)))
      .orderBy(desc(t.requestedAt));
  }
}

export const creditNoteRequestRepository = new CreditNoteRequestRepository();
