import { and, desc, eq, gte, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db/db";
import {
  customsOfficeRequestTable as requests,
  type CustomsOfficeRequestRecord,
  type CustomsOfficeRequestStatus,
  type NewCustomsOfficeRequestRecord,
} from "../schemas/customsOfficeRequest.schema";
import { shipmentTable } from "../schemas/shipment.schema";

/** A request with what the lists say about its shipment (as the shipment is now). */
export type CustomsOfficeRequestRow = CustomsOfficeRequestRecord & { jobNumber: string | null; customer: string };

// Only requests of live shipments are listed: a deleted shipment's request has nothing left to answer.
const live = (companyId: string) =>
  and(eq(requests.companyId, companyId), isNull(requests.deletedAt), isNull(shipmentTable.deletedAt));

const withShipment = () =>
  db
    .select({ request: requests, jobNumber: shipmentTable.jobNumber, customer: shipmentTable.customer })
    .from(requests)
    .innerJoin(shipmentTable, eq(shipmentTable.id, requests.shipmentId));

type Joined = { request: CustomsOfficeRequestRecord; jobNumber: string | null; customer: string };
const flat = (r: Joined): CustomsOfficeRequestRow => ({ ...r.request, jobNumber: r.jobNumber, customer: r.customer });

class CustomsOfficeRequestRepository {
  /** The new request; null when one is already waiting for the shipment. */
  async create(values: NewCustomsOfficeRequestRecord): Promise<CustomsOfficeRequestRecord | null> {
    const [row] = await db
      .insert(requests)
      .values(values)
      .onConflictDoNothing({
        target: [requests.companyId, requests.shipmentId],
        where: sql`status = 'pending' AND deleted_at IS NULL`,
      })
      .returning();
    return row ?? null;
  }

  async get(id: string, companyId: string): Promise<CustomsOfficeRequestRow | null> {
    const [row] = await withShipment().where(and(live(companyId), eq(requests.id, id))).limit(1);
    return row ? flat(row) : null;
  }

  /** The shipment's newest request, whatever became of it. */
  async latestForShipment(shipmentId: string, companyId: string): Promise<CustomsOfficeRequestRow | null> {
    const [row] = await withShipment()
      .where(and(live(companyId), eq(requests.shipmentId, shipmentId)))
      .orderBy(desc(requests.requestedAt))
      .limit(1);
    return row ? flat(row) : null;
  }

  /** The Approvals tab: everything waiting, and what was answered since `since`. */
  async listForManagers(companyId: string, since: Date, limit: number): Promise<CustomsOfficeRequestRow[]> {
    const rows = await withShipment()
      .where(and(live(companyId), or(eq(requests.status, "pending"), gte(requests.decidedAt, since))))
      .orderBy(desc(requests.requestedAt))
      .limit(limit);
    return rows.map(flat);
  }

  /** The bell: answers to this user's own requests, not opened yet or opened since `seenSince`. */
  async answersFor(companyId: string, userId: string, seenSince: Date, limit: number): Promise<CustomsOfficeRequestRow[]> {
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
    answer: { status: Exclude<CustomsOfficeRequestStatus, "pending">; decidedById: string; decidedByName: string; decidedAt: Date; comment: string },
  ): Promise<CustomsOfficeRequestRecord | null> {
    const [row] = await db
      .update(requests)
      .set({ ...answer, updatedAt: new Date() })
      .where(and(eq(requests.id, id), eq(requests.companyId, companyId), eq(requests.status, "pending"), isNull(requests.deletedAt)))
      .returning();
    return row ?? null;
  }

  /** Takes an answer back, when what it was to do could not be done. */
  async reopen(id: string, companyId: string): Promise<void> {
    await db
      .update(requests)
      .set({ status: "pending", decidedById: null, decidedByName: "", decidedAt: null, comment: "", updatedAt: new Date() })
      .where(and(eq(requests.id, id), eq(requests.companyId, companyId)));
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
          ne(requests.status, "pending"),
          isNull(requests.answerSeenAt),
        ),
      );
  }
}

export const customsOfficeRequestRepository = new CustomsOfficeRequestRepository();
