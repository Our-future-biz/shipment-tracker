import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { db, type Tx } from "../db/db";
import {
  truckingHaulierLinkTable,
  truckingTripTable,
  type NewTruckingTripRecord,
  type TruckingHaulierLinkRecord,
  type TruckingTripRecord,
} from "../schemas/truckingConsignment.schema";
import type { TripKind, TripStatus } from "../interfaces/interfaces";

const t = truckingTripTable;
const l = truckingHaulierLinkTable;
const MAX_LIST = 1000;

export type TripValues = Partial<Omit<NewTruckingTripRecord, "id" | "companyId" | "version" | "createdAt">>;

/** What must still hold for a guarded trip write to go through. */
export interface TripGuard {
  version?: number;
  /** Not cancelled */
  live?: boolean;
  /** The transport order was sent */
  sent?: boolean;
  /** The haulier has not answered (confirmed or rejected) yet */
  unanswered?: boolean;
  /** Not confirmed yet (a rejection may be overruled by a recorded confirmation) */
  unconfirmed?: boolean;
}

function guardSql(g: TripGuard): SQL[] {
  const out: SQL[] = [];
  if (g.version !== undefined) out.push(eq(t.version, g.version));
  if (g.live) out.push(isNull(t.cancelledAt));
  if (g.sent) out.push(isNotNull(t.orderSentAt));
  if (g.unanswered) out.push(isNull(t.confirmedAt), isNull(t.rejectedAt));
  if (g.unconfirmed) out.push(isNull(t.confirmedAt));
  return out;
}

class TripRepository {
  async insert(tx: Tx, values: NewTruckingTripRecord): Promise<TruckingTripRecord> {
    const [row] = await tx.insert(t).values(values).returning();
    return row!;
  }

  async find(companyId: string, id: string, reader: Tx | typeof db = db): Promise<TruckingTripRecord | null> {
    const [row] = await reader.select().from(t).where(and(eq(t.companyId, companyId), eq(t.id, id), isNull(t.deletedAt)));
    return row ?? null;
  }

  async findMany(companyId: string, ids: string[], reader: Tx | typeof db = db): Promise<TruckingTripRecord[]> {
    if (!ids.length) return [];
    return reader.select().from(t).where(and(eq(t.companyId, companyId), inArray(t.id, ids), isNull(t.deletedAt)));
  }

  async list(companyId: string, filter: { status?: TripStatus }): Promise<TruckingTripRecord[]> {
    const clauses: SQL[] = [eq(t.companyId, companyId), isNull(t.deletedAt)];
    if (filter.status) clauses.push(eq(t.status, filter.status));
    return db.select().from(t).where(and(...clauses)).orderBy(desc(t.plannedPickupDate), desc(t.createdAt)).limit(MAX_LIST);
  }

  /**
   * A haulier's trips whose transport order was sent and that are not cancelled (the haulier portal), newest first.
   * `view` narrows them in SQL before the limit, so open orders are never cut off by many done ones
   * (and the other way round). The test is loose on purpose - it keeps every trip that may be in the
   * view; the portal decides exactly (portalOrder.service isDone).
   */
  async forHaulier(companyId: string, haulierCustomerId: string, view: "open" | "done"): Promise<TruckingTripRecord[]> {
    const rejected = sql`(${t.rejectedAt} IS NOT NULL AND ${t.confirmedAt} IS NULL)`;
    // A live consignment of the trip (an FTL's own, a run's through its legs) still without a POD;
    // cancelled ones are no stop of the order.
    const podMissing = sql`EXISTS (
      SELECT 1 FROM trucking_consignment c
      WHERE c.deleted_at IS NULL AND c.cancelled_at IS NULL AND c.pod_received_at IS NULL
        AND (c.trip_id = ${t.id} OR c.id IN (SELECT g.consignment_id FROM trucking_leg g WHERE g.trip_id = ${t.id} AND g.deleted_at IS NULL)))`;
    const mayBeOpen = sql`NOT ${rejected} AND (${t.arrivedAt} IS NULL OR ${podMissing})`;
    const mayBeDone = sql`(${rejected} OR ${t.arrivedAt} IS NOT NULL OR NOT ${podMissing})`;
    return db
      .select()
      .from(t)
      .where(
        and(
          eq(t.companyId, companyId),
          eq(t.haulierCustomerId, haulierCustomerId),
          isNull(t.deletedAt),
          isNull(t.cancelledAt),
          isNotNull(t.orderSentAt),
          view === "open" ? mayBeOpen : mayBeDone,
        ),
      )
      .orderBy(desc(t.plannedPickupDate), desc(t.createdAt))
      .limit(MAX_LIST);
  }

  /** The trip row locked FOR UPDATE until the caller's transaction ends (its legs are about to change). */
  async lock(tx: Tx, companyId: string, id: string): Promise<TruckingTripRecord | null> {
    const [row] = await tx.select().from(t).where(and(eq(t.companyId, companyId), eq(t.id, id), isNull(t.deletedAt))).for("update");
    return row ?? null;
  }

  /** The live LTL trips of a kind on a day (the planning board). */
  async listLtl(companyId: string, kind: TripKind, date: string): Promise<TruckingTripRecord[]> {
    return db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), isNull(t.deletedAt), isNull(t.cancelledAt), eq(t.kind, kind), eq(t.plannedPickupDate, date)))
      .orderBy(asc(t.createdAt));
  }

  /** Writes `values` when the guard still holds; bumps the version. Null when it no longer does. */
  async update(tx: Tx, companyId: string, id: string, values: TripValues, guard: TripGuard = {}): Promise<TruckingTripRecord | null> {
    const [row] = await tx
      .update(t)
      .set({ ...values, version: sql`${t.version} + 1`, updatedAt: new Date() })
      .where(and(eq(t.companyId, companyId), eq(t.id, id), isNull(t.deletedAt), ...guardSql(guard)))
      .returning();
    return row ?? null;
  }

  // ---- the haulier's link ----------------------------------------------------------------------

  /** A new link for the trip; the old live one is revoked first (one live link per trip). */
  async renewLink(tx: Tx, companyId: string, tripId: string, tokenHash: string, expiresAt: Date): Promise<TruckingHaulierLinkRecord> {
    await this.revokeLinks(tx, companyId, tripId);
    const [row] = await tx.insert(l).values({ companyId, tripId, tokenHash, expiresAt }).returning();
    return row!;
  }

  async revokeLinks(tx: Tx, companyId: string, tripId: string): Promise<void> {
    const now = new Date();
    await tx
      .update(l)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(l.companyId, companyId), eq(l.tripId, tripId), isNull(l.revokedAt), isNull(l.deletedAt)));
  }

  /** The live link of a trip (for its expiry), if any. */
  async liveLink(companyId: string, tripId: string): Promise<TruckingHaulierLinkRecord | null> {
    const [row] = await db
      .select()
      .from(l)
      .where(and(eq(l.companyId, companyId), eq(l.tripId, tripId), isNull(l.revokedAt), isNull(l.deletedAt)));
    return row ?? null;
  }

  /** The link with this token hash, whatever its company (the public page knows no company). */
  async linkByHash(tokenHash: string): Promise<TruckingHaulierLinkRecord | null> {
    const [row] = await db.select().from(l).where(and(eq(l.tokenHash, tokenHash), isNull(l.deletedAt)));
    return row ?? null;
  }
}

export const tripRepository = new TripRepository();
