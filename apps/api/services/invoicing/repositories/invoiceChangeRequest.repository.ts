import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import { db } from "../db/db";
import { invoiceChangeRequestTable as t, type InvoiceChangeRequestRecord, type NewInvoiceChangeRequestRecord } from "../schemas/invoiceChangeRequest.schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = typeof db | Tx;

export const EXPIRED_COMMENT = "Not answered on the day the invoice was issued: only a credit note corrects it now";

/** Requests to change an invoice on its issue day (schemas/invoiceChangeRequest), and their answers. */
class InvoiceChangeRequestRepository {
  /** A new request; null when one already waits for this invoice. */
  async create(values: NewInvoiceChangeRequestRecord): Promise<InvoiceChangeRequestRecord | null> {
    const [row] = await db.insert(t).values(values).onConflictDoNothing().returning();
    return row ?? null;
  }

  async byId(companyId: string, id: string, reader: Reader = db): Promise<InvoiceChangeRequestRecord | null> {
    const [row] = await reader.select().from(t).where(and(eq(t.id, id), eq(t.companyId, companyId), isNull(t.deletedAt))).limit(1);
    return row ?? null;
  }

  /** Requests still waiting from an issue day before `today` expire: they can no longer be approved. */
  async expireStale(companyId: string, today: string): Promise<void> {
    const now = new Date();
    await db
      .update(t)
      .set({ status: "expired", decidedAt: now, comment: EXPIRED_COMMENT, updatedAt: now })
      .where(and(eq(t.companyId, companyId), eq(t.status, "pending"), lt(t.issueDate, today), isNull(t.deletedAt)));
  }

  /** Approves a waiting request; null when it no longer waits. */
  async approve(tx: Tx, companyId: string, id: string, by: { userId: string; userEmail: string; comment: string }): Promise<InvoiceChangeRequestRecord | null> {
    const now = new Date();
    const [row] = await tx
      .update(t)
      .set({ status: "approved", decidedById: by.userId, decidedByName: by.userEmail, decidedAt: now, comment: by.comment, updatedAt: now })
      .where(and(eq(t.id, id), eq(t.companyId, companyId), eq(t.status, "pending"), isNull(t.deletedAt)))
      .returning();
    if (!row) return null;
    if (row.requestedById === by.userId) {
      const [own] = await tx.update(t).set({ selfDecision: true }).where(eq(t.id, row.id)).returning();
      return own ?? row;
    }
    return row;
  }

  /** Rejects a waiting request; null when it no longer waits. */
  async reject(companyId: string, id: string, by: { userId: string; userEmail: string; comment: string }): Promise<InvoiceChangeRequestRecord | null> {
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

  /** Marks one waiting request expired (found so when a manager answers it). */
  async expire(companyId: string, id: string): Promise<InvoiceChangeRequestRecord | null> {
    const now = new Date();
    const [row] = await db
      .update(t)
      .set({ status: "expired", decidedAt: now, comment: EXPIRED_COMMENT, updatedAt: now })
      .where(and(eq(t.id, id), eq(t.companyId, companyId), eq(t.status, "pending"), isNull(t.deletedAt)))
      .returning();
    return row ?? null;
  }

  /** Takes one waiting request back; null when it no longer waits. */
  async withdraw(companyId: string, id: string, by: { id: string; name: string }): Promise<InvoiceChangeRequestRecord | null> {
    const now = new Date();
    const [row] = await db
      .update(t)
      .set({ status: "withdrawn", decidedById: by.id, decidedByName: by.name, decidedAt: now, updatedAt: now })
      .where(and(eq(t.id, id), eq(t.companyId, companyId), eq(t.status, "pending"), isNull(t.deletedAt)))
      .returning();
    return row ?? null;
  }

  /** The request waiting for an invoice a credit note has corrected meanwhile: it can't cancel it any more. */
  async withdrawForInvoice(tx: Tx, companyId: string, invoiceId: string, by: { id: string; name: string }, comment: string): Promise<void> {
    const now = new Date();
    await tx
      .update(t)
      .set({ status: "withdrawn", decidedById: by.id, decidedByName: by.name, decidedAt: now, comment, updatedAt: now })
      .where(and(eq(t.companyId, companyId), eq(t.invoiceId, invoiceId), eq(t.status, "pending"), isNull(t.deletedAt)));
  }

  /** The request waiting for this invoice, if any. */
  async pendingFor(companyId: string, invoiceId: string): Promise<InvoiceChangeRequestRecord | null> {
    const [row] = await db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.invoiceId, invoiceId), eq(t.status, "pending"), isNull(t.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  /** The managers' list: what waits, and what was answered (or expired) since `since`; not what was taken back. */
  async list(companyId: string, since: Date, limit: number): Promise<InvoiceChangeRequestRecord[]> {
    return db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), isNull(t.deletedAt), or(eq(t.status, "pending"), and(ne(t.status, "withdrawn"), gte(t.decidedAt, since)))))
      .orderBy(desc(t.requestedAt))
      .limit(limit);
  }

  /** What waits for a manager, newest first (the bell). */
  async pending(companyId: string, limit: number): Promise<InvoiceChangeRequestRecord[]> {
    return db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.status, "pending"), isNull(t.deletedAt)))
      .orderBy(desc(t.requestedAt))
      .limit(limit);
  }

  /** Answers to what this user asked (an expiry too), for their bell; the one who answered is not told their own answer. */
  async answersFor(companyId: string, userId: string, since: Date, seenSince: Date, limit: number): Promise<InvoiceChangeRequestRecord[]> {
    return db
      .select()
      .from(t)
      .where(
        and(
          eq(t.companyId, companyId),
          isNull(t.deletedAt),
          eq(t.requestedById, userId),
          inArray(t.status, ["approved", "rejected", "expired"]),
          or(isNull(t.decidedById), ne(t.decidedById, userId)),
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
  async ofShipment(companyId: string, shipmentId: string): Promise<InvoiceChangeRequestRecord[]> {
    return db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)))
      .orderBy(desc(t.requestedAt));
  }
}

export const invoiceChangeRequestRepository = new InvoiceChangeRequestRepository();
