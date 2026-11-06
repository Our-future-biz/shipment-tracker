import { and, desc, eq, gte, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db/db";
import {
  documentChangeRequestTable as requests,
  type DocumentChangeRequestRecord,
  type DocumentChangeRequestStatus,
  type NewDocumentChangeRequestRecord,
} from "../schemas/documentChangeRequest.schema";
import { shipmentTable } from "../schemas/shipment.schema";
import { shipmentAttachmentTable as attachments, type NewShipmentAttachmentRecord } from "../schemas/shipmentAttachment.schema";

/** Thrown inside the approval's transaction when the approved document isn't there to replace any more. */
export class DocumentNoLongerApproved extends Error {}

/** A request with what the lists say about its shipment (as the shipment is now). */
export type DocumentChangeRequestRow = DocumentChangeRequestRecord & { jobNumber: string | null; customer: string };

// Only requests of live shipments are listed: a deleted shipment's request has nothing left to answer.
const live = (companyId: string) => and(eq(requests.companyId, companyId), isNull(requests.deletedAt), isNull(shipmentTable.deletedAt));

const withShipment = () =>
  db
    .select({ request: requests, jobNumber: shipmentTable.jobNumber, customer: shipmentTable.customer })
    .from(requests)
    .innerJoin(shipmentTable, and(eq(shipmentTable.id, requests.shipmentId), eq(shipmentTable.companyId, requests.companyId)));

type Joined = { request: DocumentChangeRequestRecord; jobNumber: string | null; customer: string };
const flat = (r: Joined): DocumentChangeRequestRow => ({ ...r.request, jobNumber: r.jobNumber, customer: r.customer });

class DocumentChangeRequestRepository {
  /** The new request; null when one is already waiting for the document. */
  async create(values: NewDocumentChangeRequestRecord): Promise<DocumentChangeRequestRecord | null> {
    const [row] = await db
      .insert(requests)
      .values(values)
      .onConflictDoNothing({
        target: [requests.companyId, requests.attachmentId],
        where: sql`status = 'pending' AND deleted_at IS NULL`,
      })
      .returning();
    return row ?? null;
  }

  async get(id: string, companyId: string): Promise<DocumentChangeRequestRow | null> {
    const [row] = await withShipment().where(and(live(companyId), eq(requests.id, id))).limit(1);
    return row ? flat(row) : null;
  }

  /** Whether a request already waits for the document, so no file is stored for nothing. */
  async isWaiting(attachmentId: string, companyId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: requests.id })
      .from(requests)
      .where(and(eq(requests.companyId, companyId), eq(requests.attachmentId, attachmentId), eq(requests.status, "pending"), isNull(requests.deletedAt)))
      .limit(1);
    return !!row;
  }

  /** The shipment's requests, newest first, for its documents' rows. */
  async listForShipment(shipmentId: string, companyId: string): Promise<DocumentChangeRequestRow[]> {
    const rows = await withShipment()
      .where(and(live(companyId), eq(requests.shipmentId, shipmentId)))
      .orderBy(desc(requests.requestedAt));
    return rows.map(flat);
  }

  /** The Approvals tab: everything waiting, and what was answered since `since`. */
  async listForManagers(companyId: string, since: Date, limit: number): Promise<DocumentChangeRequestRow[]> {
    const rows = await withShipment()
      .where(and(live(companyId), or(eq(requests.status, "pending"), gte(requests.decidedAt, since))))
      .orderBy(desc(requests.requestedAt))
      .limit(limit);
    return rows.map(flat);
  }

  /** The bell: answers to this user's own requests, not opened yet or opened since `seenSince`. */
  async answersFor(companyId: string, userId: string, seenSince: Date, limit: number): Promise<DocumentChangeRequestRow[]> {
    const rows = await withShipment()
      .where(
        and(
          live(companyId),
          eq(requests.requestedById, userId),
          ne(requests.status, "pending"),
          or(isNull(requests.answerSeenAt), gte(requests.answerSeenAt, seenSince)),
        ),
      )
      .orderBy(desc(requests.decidedAt))
      .limit(limit);
    return rows.map(flat);
  }

  /** Answers a request still waiting; null when someone else answered it first. */
  async answer(
    id: string,
    companyId: string,
    answer: { status: Exclude<DocumentChangeRequestStatus, "pending">; decidedById: string; decidedByName: string; decidedAt: Date; comment: string },
  ): Promise<DocumentChangeRequestRecord | null> {
    const [row] = await db
      .update(requests)
      .set({ ...answer, updatedAt: new Date() })
      .where(and(eq(requests.id, id), eq(requests.companyId, companyId), eq(requests.status, "pending"), isNull(requests.deletedAt)))
      .returning();
    return row ?? null;
  }

  /**
   * A manager's approval, in one transaction: the answer (only while the request still waits), the
   * approved document leaving the lists (only while it is still live and approved) and the new file
   * taking its place. Null when the request was answered meanwhile; DocumentNoLongerApproved when
   * the document changed meanwhile. Either way nothing is written.
   */
  async approveWithSwap(
    id: string,
    companyId: string,
    answer: { decidedById: string; decidedByName: string; decidedAt: Date; comment: string },
    replaced: { attachmentId: string; shipmentId: string },
    replacement: Omit<NewShipmentAttachmentRecord, "companyId" | "shipmentId">,
  ): Promise<DocumentChangeRequestRecord | null> {
    return db.transaction(async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(requests)
        .set({ ...answer, status: "approved", updatedAt: now })
        .where(and(eq(requests.id, id), eq(requests.companyId, companyId), eq(requests.status, "pending"), isNull(requests.deletedAt)))
        .returning();
      if (!row) return null;
      const [old] = await tx
        .update(attachments)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(attachments.id, replaced.attachmentId),
            eq(attachments.shipmentId, replaced.shipmentId),
            eq(attachments.companyId, companyId),
            eq(attachments.customsStatus, "approved"),
            isNull(attachments.deletedAt),
          ),
        )
        .returning({ id: attachments.id });
      if (!old) throw new DocumentNoLongerApproved();
      await tx.insert(attachments).values({ ...replacement, companyId, shipmentId: replaced.shipmentId });
      return row;
    });
  }

  /** The one who asked opened the answer. Only theirs, only once. */
  async markSeen(id: string, companyId: string, userId: string, at: Date): Promise<void> {
    await db
      .update(requests)
      .set({ answerSeenAt: at, updatedAt: at })
      .where(and(eq(requests.id, id), eq(requests.companyId, companyId), eq(requests.requestedById, userId), ne(requests.status, "pending"), isNull(requests.answerSeenAt)));
  }
}

export const documentChangeRequestRepository = new DocumentChangeRequestRepository();
