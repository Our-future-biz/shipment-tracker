import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db, type Tx } from "../db/db";
import { AUDIT_READ_LIMIT } from "../lib/cockpitThresholds";
import { CLOSED_COMMENT } from "../lib/releaseRequest";
import {
  shipmentReleaseRequestTable as requests,
  type NewShipmentReleaseRequestRecord,
  type ShipmentReleaseRequestRecord,
  type ShipmentReleaseRequestStatus,
  type ShipmentReleaseRequestWhat,
} from "../schemas/shipmentReleaseRequest.schema";
import { shipmentTable } from "../schemas/shipment.schema";
import { shipmentAuditRepository } from "./shipmentAudit.repository";

/** A request with what the lists say about its shipment (as the shipment is now). */
export type ReleaseRequestRow = ShipmentReleaseRequestRecord & { jobNumber: string | null; customer: string };

/** The line a request, or its answer, leaves in the job's history. */
type History = { userId: string; field: string; oldValue: string | null; newValue: string | null };

/** A request a manager answered, for Shipments → Managers' audit line. */
export interface DecidedReleaseRequest {
  id: string;
  shipmentId: string;
  status: ShipmentReleaseRequestStatus;
  decidedAt: Date | null;
  decidedByName: string;
  what: ShipmentReleaseRequestWhat;
  /** The manager's reason. */
  comment: string;
}

/** The two answers a manager gives. A closed request was answered by nobody. */
const ANSWERED = ["approved", "rejected"] as const;

// Only requests of live shipments are listed: a deleted shipment's request has nothing left to answer.
const live = (companyId: string) => and(eq(requests.companyId, companyId), isNull(requests.deletedAt), isNull(shipmentTable.deletedAt));

const withShipment = () =>
  db
    .select({ request: requests, jobNumber: shipmentTable.jobNumber, customer: shipmentTable.customer })
    .from(requests)
    .innerJoin(shipmentTable, and(eq(shipmentTable.id, requests.shipmentId), eq(shipmentTable.companyId, requests.companyId)));

// Closed by a release made another way since `since`: dated by the write that closed it (one closed while it waited has no decision).
const closedSince = (since: Date) => and(eq(requests.status, "closed"), gte(requests.updatedAt, since));

// An approved request that can still be used: not used yet, decided no longer ago than a pass is good for.
const usable = (decidedSince: Date) => and(eq(requests.status, "approved"), isNull(requests.usedAt), gte(requests.decidedAt, decidedSince), isNull(requests.deletedAt));

type Joined = { request: ShipmentReleaseRequestRecord; jobNumber: string | null; customer: string };
const flat = (r: Joined): ReleaseRequestRow => ({ ...r.request, jobNumber: r.jobNumber, customer: r.customer });

// The requests to release a job the prepayment stop holds (lib/releaseRequest), kept as the Customs Office
// requests are (customsOfficeRequest.repository): one waits per shipment and thing asked, an answer is given
// once - and an approved one is used once, in the write turn of the release it lets through.
class ShipmentReleaseRequestRepository {
  /** The new request with its line in the job's history; null when one is already waiting for the shipment and thing asked - then nothing is written. */
  async create(values: NewShipmentReleaseRequestRecord, history: History): Promise<ShipmentReleaseRequestRecord | null> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(requests)
        .values(values)
        .onConflictDoNothing({
          target: [requests.companyId, requests.shipmentId, requests.what],
          where: sql`status = 'pending' AND deleted_at IS NULL`,
        })
        .returning();
      if (!row) return null;
      await shipmentAuditRepository.create({ companyId: values.companyId, shipmentId: values.shipmentId, ...history }, tx);
      return row;
    });
  }

  async get(id: string, companyId: string): Promise<ReleaseRequestRow | null> {
    const [row] = await withShipment().where(and(live(companyId), eq(requests.id, id))).limit(1);
    return row ? flat(row) : null;
  }

  /** The shipment's newest request of each thing asked, whatever became of it: at most two rows. */
  async latestForShipment(shipmentId: string, companyId: string): Promise<ReleaseRequestRow[]> {
    const rows = await withShipment()
      .where(and(live(companyId), eq(requests.shipmentId, shipmentId)))
      .orderBy(desc(requests.requestedAt));
    const seen = new Set<string>();
    return rows.map(flat).filter((r) => !seen.has(r.what) && !!seen.add(r.what));
  }

  /** The Approvals tab: everything waiting, and what was answered - or closed by a release made another way - since `since`. */
  async listForManagers(companyId: string, since: Date, limit: number): Promise<ReleaseRequestRow[]> {
    const rows = await withShipment()
      .where(and(live(companyId), or(eq(requests.status, "pending"), gte(requests.decidedAt, since), closedSince(since))))
      .orderBy(desc(requests.requestedAt))
      .limit(limit);
    return rows.map(flat);
  }

  /** A user's own requests: those waiting, and those answered or closed since `since`. */
  async listForUser(companyId: string, userId: string, since: Date, limit: number): Promise<ReleaseRequestRow[]> {
    const rows = await withShipment()
      .where(and(live(companyId), eq(requests.requestedById, userId), or(eq(requests.status, "pending"), gte(requests.decidedAt, since), closedSince(since))))
      .orderBy(desc(requests.requestedAt))
      .limit(limit);
    return rows.map(flat);
  }

  /** The bell: a manager's answers to this user's own requests, not opened yet or opened since `seenSince`. A closed request is no answer. */
  async answersFor(companyId: string, userId: string, seenSince: Date, limit: number): Promise<ReleaseRequestRow[]> {
    const rows = await withShipment()
      .where(
        and(
          live(companyId),
          eq(requests.requestedById, userId),
          inArray(requests.status, [...ANSWERED]),
          or(isNull(requests.answerSeenAt), gte(requests.answerSeenAt, seenSince)),
        ),
      )
      .orderBy(desc(requests.decidedAt))
      .limit(limit);
    return rows.map(flat);
  }

  /**
   * Answers a request still waiting, with the answer's line in the job's history - together or not
   * at all; null when someone else answered it first (or it was closed): then nothing is written.
   */
  async answer(
    id: string,
    companyId: string,
    answer: { status: (typeof ANSWERED)[number]; decidedById: string; decidedByName: string; decidedAt: Date; comment: string },
    history: History,
  ): Promise<ShipmentReleaseRequestRecord | null> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(requests)
        .set({ ...answer, updatedAt: new Date() })
        .where(and(eq(requests.id, id), eq(requests.companyId, companyId), eq(requests.status, "pending"), isNull(requests.deletedAt)))
        .returning();
      if (row) await shipmentAuditRepository.create({ companyId, shipmentId: row.shipmentId, ...history }, tx);
      return row ?? null;
    });
  }

  /**
   * The approved request that lets a release of this shipment through now, the newest: approved
   * since `decidedSince` (lib/releaseRequest passDecidedSince) and not used yet. Null when none.
   */
  async usablePass(companyId: string, shipmentId: string, what: ShipmentReleaseRequestWhat, decidedSince: Date): Promise<ShipmentReleaseRequestRecord | null> {
    const [row] = await db
      .select()
      .from(requests)
      .where(and(eq(requests.companyId, companyId), eq(requests.shipmentId, shipmentId), eq(requests.what, what), usable(decidedSince)))
      .orderBy(desc(requests.decidedAt))
      .limit(1);
    return row ?? null;
  }

  /**
   * Marks an approved request used, in the write turn of the release it lets through. Once: false
   * when it is used already, no longer approved, or older than `decidedSince` - the caller then
   * refuses the release, and its turn writes nothing.
   */
  async use(tx: Tx, id: string, companyId: string, by: { usedAt: Date; usedById: string; usedByName: string }, decidedSince: Date): Promise<boolean> {
    const rows = await tx
      .update(requests)
      .set({ ...by, updatedAt: by.usedAt })
      .where(and(eq(requests.id, id), eq(requests.companyId, companyId), usable(decidedSince)))
      .returning({ id: requests.id });
    return rows.length > 0;
  }

  /**
   * Closes what a release that has just been made another way leaves with nothing to do, in that
   * release's write turn: the request still waiting (nobody decided it: its decided fields stay
   * empty), and an approved one nobody used - it keeps who approved it and when, but lets nothing
   * through any more, so a Warehouse Released cleared and set again can't ride on an old approval.
   * The comment says why. An approval the release itself used is used, not closed: it is left as
   * it is. How many of each were closed.
   */
  async closeUnused(tx: Tx, companyId: string, shipmentId: string, what: ShipmentReleaseRequestWhat, at: Date): Promise<{ waiting: number; approved: number }> {
    const rows = await tx
      .update(requests)
      .set({ status: "closed", comment: CLOSED_COMMENT, updatedAt: at })
      .where(
        and(
          eq(requests.companyId, companyId),
          eq(requests.shipmentId, shipmentId),
          eq(requests.what, what),
          or(eq(requests.status, "pending"), and(eq(requests.status, "approved"), isNull(requests.usedAt))),
          isNull(requests.deletedAt),
        ),
      )
      .returning({ decidedAt: requests.decidedAt });
    // One that was approved has its decision; one that waited has none.
    const approved = rows.filter((r) => r.decidedAt !== null).length;
    return { waiting: rows.length - approved, approved };
  }

  /** The one who asked opened the answer. Only theirs, only once. */
  async markSeen(id: string, companyId: string, userId: string, at: Date): Promise<void> {
    await db
      .update(requests)
      .set({ answerSeenAt: at, updatedAt: at })
      .where(
        and(
          eq(requests.id, id),
          eq(requests.companyId, companyId),
          eq(requests.requestedById, userId),
          inArray(requests.status, [...ANSWERED]),
          isNull(requests.answerSeenAt),
        ),
      );
  }

  /** The requests still waiting on these shipments and since when: one query for Shipments → Managers' cards. */
  async waitingByShipmentIds(shipmentIds: readonly string[], companyId: string): Promise<{ shipmentId: string; what: ShipmentReleaseRequestWhat; requestedAt: Date }[]> {
    if (shipmentIds.length === 0) return [];
    return db
      .select({ shipmentId: requests.shipmentId, what: requests.what, requestedAt: requests.requestedAt })
      .from(requests)
      .where(and(eq(requests.companyId, companyId), inArray(requests.shipmentId, [...shipmentIds]), eq(requests.status, "pending"), isNull(requests.deletedAt)));
  }

  /**
   * The requests a manager answered since `since`, the newest first, at most `limit`: Shipments →
   * Managers' audit line. Of deleted jobs too - it is a record. A request closed while it waited
   * was answered by nobody and is left out; an approval closed unused was still a manager's
   * approval, and is given as one (its comment then reads "Released without it" - the manager's
   * reason is in the job's history).
   */
  async decidedSince(companyId: string, since: Date, limit: number = AUDIT_READ_LIMIT): Promise<DecidedReleaseRequest[]> {
    return db
      .select({
        id: requests.id,
        shipmentId: requests.shipmentId,
        status: sql<ShipmentReleaseRequestStatus>`CASE WHEN ${requests.status} = 'closed' THEN 'approved' ELSE ${requests.status} END`,
        decidedAt: requests.decidedAt,
        decidedByName: requests.decidedByName,
        what: requests.what,
        comment: requests.comment,
      })
      .from(requests)
      // A decision's date is what tells: a request closed while waiting has none.
      .where(and(eq(requests.companyId, companyId), inArray(requests.status, [...ANSWERED, "closed"]), gte(requests.decidedAt, since), isNull(requests.deletedAt)))
      .orderBy(desc(requests.decidedAt))
      .limit(limit);
  }
}

export const shipmentReleaseRequestRepository = new ShipmentReleaseRequestRepository();
