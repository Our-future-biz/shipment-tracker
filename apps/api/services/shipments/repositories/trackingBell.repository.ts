import { and, desc, eq, gte, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "../db/db";
import { CANCELLED_STATUS } from "../lib/fieldDefaults";
import { shipmentTable as s } from "../schemas/shipment.schema";
import { shipmentAuditTable as audit } from "../schemas/shipmentAudit.schema";
import { shipmentCustomerNoticeTable as notice } from "../schemas/shipmentCustomerNotice.schema";
import { shipmentTrackingEventTable as event } from "../schemas/shipmentTrackingEvent.schema";
import { shipmentTrackingReadTable as read } from "../schemas/shipmentTrackingRead.schema";

// A person is kept by e-mail; an old value may carry a name after it ("a@b.cz — Name").
const namedEmail = (column: PgColumn) => sql`lower(trim(split_part(${column}, ' — ', 1)))`;
const isOwn = (email: string): SQL => or(sql`${namedEmail(s.personInCharge)} = ${email}`, sql`${namedEmail(s.holidayCover)} = ${email}`)!;
const notCancelled = sql`${s.status} IS DISTINCT FROM ${CANCELLED_STATUS}`;

// The shipment's newest notice: no later one is live.
const isLatestNotice = sql`NOT EXISTS (
  SELECT 1 FROM ${notice} newer
  WHERE newer.shipment_id = ${notice.shipmentId} AND newer.deleted_at IS NULL
    AND (newer.created_at, newer.id) > (${notice.createdAt}, ${notice.id})
)`;

// A date told that has moved since and hasn't happened yet: what lib/customerNotice toldDifferences
// reports, so the limit only counts notices that are still news. A delivered or invoiced job has
// nothing left to tell.
const toldHasMoved = sql`(
  (${notice.etaPod} IS NOT NULL AND ${s.actualArrival} IS NULL AND ${notice.etaPod} IS DISTINCT FROM ${s.estimatedArrival})
  OR (${notice.etaWarehouse} IS NOT NULL AND ${s.warehouseReceivedDate} IS NULL AND ${notice.etaWarehouse} IS DISTINCT FROM ${s.etaWarehouse})
  OR (${notice.plannedDelivery} IS NOT NULL AND ${notice.plannedDelivery} IS DISTINCT FROM ${s.plannedDeliveryDate})
)`;

/** What the bell reads about a shipment's dates, for one user. */
class TrackingBellRepository {
  /** Moves of the given planned dates on this user's shipments, by somebody else, the newest first. */
  async datesMoved(companyId: string, userId: string, email: string, fields: readonly string[], since: Date, readSince: Date, limit: number) {
    return db
      .select({
        id: audit.id,
        shipmentId: audit.shipmentId,
        jobNumber: s.jobNumber,
        field: audit.field,
        oldValue: audit.oldValue,
        newValue: audit.newValue,
        changedAt: audit.changedAt,
        userId: audit.userId,
        ownShipment: sql<boolean>`${isOwn(email)}`,
        readAt: read.readAt,
      })
      .from(audit)
      .innerJoin(s, eq(s.id, audit.shipmentId))
      .leftJoin(read, and(eq(read.shipmentId, audit.shipmentId), eq(read.userId, userId)))
      .where(
        and(
          eq(audit.companyId, companyId),
          isNull(s.deletedAt),
          notCancelled,
          inArray(audit.field, [...fields]),
          gte(audit.changedAt, since),
          ne(audit.userId, userId),
          or(isOwn(email), sql`${namedEmail(s.salesPerson)} = ${email}`),
          or(isNull(read.readAt), sql`${audit.changedAt} > ${read.readAt}`, gte(audit.changedAt, readSince)),
        ),
      )
      .orderBy(desc(audit.changedAt))
      .limit(limit);
  }

  /** Dates a source proposes on this user's shipments, waiting for somebody. */
  async proposed(companyId: string, userId: string, email: string, limit: number) {
    return db
      .select({
        id: event.id,
        shipmentId: event.shipmentId,
        jobNumber: s.jobNumber,
        kind: event.kind,
        source: event.source,
        effectField: event.effectField,
        effectValue: event.effectValue,
        occurredOn: event.occurredOn,
        createdAt: event.createdAt,
        readAt: read.readAt,
      })
      .from(event)
      .innerJoin(s, eq(s.id, event.shipmentId))
      .leftJoin(read, and(eq(read.shipmentId, event.shipmentId), eq(read.userId, userId)))
      .where(and(eq(event.companyId, companyId), eq(event.effect, "proposed"), isNull(event.deletedAt), isNull(s.deletedAt), notCancelled, isOwn(email)))
      .orderBy(desc(event.createdAt))
      .limit(limit);
  }

  /**
   * The latest notice to the customer of each of this user's live shipments whose dates have moved
   * from it, with the dates they hold now, the latest notice first.
   */
  async latestToldOnOwnShipments(companyId: string, userId: string, email: string, limit: number) {
    return db
      .select({
        shipmentId: notice.shipmentId,
        jobNumber: s.jobNumber,
        noticeAt: notice.createdAt,
        etaPod: notice.etaPod,
        etaWarehouse: notice.etaWarehouse,
        plannedDelivery: notice.plannedDelivery,
        estimatedArrival: s.estimatedArrival,
        actualArrival: s.actualArrival,
        etaWarehouseNow: s.etaWarehouse,
        warehouseReceivedDate: s.warehouseReceivedDate,
        plannedDeliveryDate: s.plannedDeliveryDate,
        actualDeliveryDate: s.actualDeliveryDate,
        readAt: read.readAt,
      })
      .from(notice)
      .innerJoin(s, eq(s.id, notice.shipmentId))
      .leftJoin(read, and(eq(read.shipmentId, notice.shipmentId), eq(read.userId, userId)))
      .where(
        and(
          eq(notice.companyId, companyId),
          isNull(notice.deletedAt),
          isLatestNotice,
          isNull(s.deletedAt),
          notCancelled,
          sql`${s.invoicingStatus} IS DISTINCT FROM 'Invoiced'`,
          isNull(s.actualDeliveryDate),
          isOwn(email),
          toldHasMoved,
        ),
      )
      .orderBy(desc(notice.createdAt), desc(notice.id))
      .limit(limit);
  }

  /** Of these shipments, those whose customer was told a date. */
  async toldShipments(companyId: string, shipmentIds: readonly string[]): Promise<Set<string>> {
    if (shipmentIds.length === 0) return new Set();
    const rows = await db
      .selectDistinct({ shipmentId: notice.shipmentId })
      .from(notice)
      .where(and(eq(notice.companyId, companyId), inArray(notice.shipmentId, [...shipmentIds]), isNull(notice.deletedAt)));
    return new Set(rows.map((r) => r.shipmentId));
  }

  /** When each of these fields of these shipments last changed, by "shipment:field". */
  async lastChanges(companyId: string, shipmentIds: readonly string[], fields: readonly string[]): Promise<Map<string, Date>> {
    if (shipmentIds.length === 0) return new Map();
    const rows = await db
      .select({ shipmentId: audit.shipmentId, field: audit.field, at: sql<string>`max(${audit.changedAt})` })
      .from(audit)
      .where(and(eq(audit.companyId, companyId), inArray(audit.shipmentId, [...shipmentIds]), inArray(audit.field, [...fields])))
      .groupBy(audit.shipmentId, audit.field);
    return new Map(rows.map((r) => [`${r.shipmentId}:${r.field}`, new Date(r.at)]));
  }

  /** This user has just opened the shipment's Tracking tab. */
  async markRead(companyId: string, userId: string, shipmentId: string): Promise<void> {
    const now = new Date();
    await db
      .insert(read)
      .values({ companyId, userId, shipmentId, readAt: now })
      .onConflictDoUpdate({ target: [read.userId, read.shipmentId], set: { readAt: now, updatedAt: now } });
  }
}

export const trackingBellRepository = new TrackingBellRepository();
