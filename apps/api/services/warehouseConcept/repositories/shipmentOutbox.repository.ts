import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/db";
import { shipmentOutboxTable, type NewShipmentOutboxRecord, type ShipmentOutboxRecord } from "../schemas/shipmentOutbox.schema";
import type { Tx } from "./warehouseSection.repository";
import { OutboxRepository } from "../../../lib/outbox/outboxRepository";

const o = shipmentOutboxTable;

// Claiming and settling (claimDueRows, markSent, markRetry, markFailed, stalePending) come from
// the shared OutboxRepository; what is particular to gate stamps is here.
class ShipmentOutboxRepository extends OutboxRepository<typeof shipmentOutboxTable> {
  constructor() {
    // Updates of one shipment go out in order; a row cancelled by a voided stamp while it was on
    // its way is recorded as sent with this note.
    // The received and released dates and the plate are whole values of the shipment: a newer one sent
    // makes an older failed one obsolete.
    super(db, shipmentOutboxTable, "warehouse_shipment_outbox", { orderKey: "shipment_id", sentAfterCancelNote: "sent just before the stamp was voided", wholeValueKinds: ["received", "released", "plate"] });
  }

  // Written in the stamp's own transaction, so the stamp and what it owes the shipment are
  // committed together (or not at all).
  async enqueue(tx: Tx, rows: NewShipmentOutboxRecord[]) {
    if (!rows.length) return [];
    // Each row stamped with the clock as it is written (not the transaction's start, as now() would):
    // rows written together go out in the order they were made (the outbox orders by created_at).
    return tx.insert(o).values(rows.map((r) => ({ ...r, createdAt: sql`clock_timestamp()` }))).returning();
  }

  // Takes up to `limit` due rows for delivery (see OutboxRepository.claimDueRows). Updates of one
  // shipment go out in the order they were made — a "released" date waits while the "received"
  // date is still on its way. A row that failed for good does not hold the later ones back: it
  // is shown on the record and a manager can send it again.
  // With `movementId`, only that record's rows (the delivery right after a stamp); with
  // `shipmentIds`, only the rows of those shipments ("Retry now").
  async claimDue(limit: number, filter: { movementId?: string; shipmentIds?: string[] } = {}): Promise<ShipmentOutboxRecord[]> {
    const { movementId, shipmentIds } = filter;
    if (shipmentIds && !shipmentIds.length) return [];
    const ids = await this.claimDueRows(
      limit,
      sql`${movementId ? sql`AND x.movement_id = ${movementId}` : sql``}
          ${shipmentIds ? sql`AND x.shipment_id IN (${sql.join(shipmentIds.map((id) => sql`${id}`), sql`, `)})` : sql``}`,
    );
    if (!ids.length) return [];
    return db.select().from(o).where(inArray(o.id, ids)).orderBy(asc(o.createdAt), asc(o.id));
  }

  // A voided stamp: what it still owes the shipment is cancelled. Returns the rows of those
  // stamps as they were (to tell whether an update already reached the shipment).
  async cancelForStamps(tx: Tx, movementId: string, companyId: string, stamps: string[]) {
    const before = await tx
      .select()
      .from(o)
      .where(and(eq(o.companyId, companyId), eq(o.movementId, movementId), inArray(o.stamp, stamps)))
      .for("update");
    await tx
      .update(o)
      .set({ status: "cancelled", lockedUntil: null, lastError: "stamp voided", updatedAt: new Date() })
      .where(and(eq(o.companyId, companyId), eq(o.movementId, movementId), inArray(o.stamp, stamps), inArray(o.status, ["pending", "failed"])));
    return before;
  }

  // A shipment deleted in Shipments: everything still owed to it (pending or failed) is cancelled.
  async cancelForShipment(tx: Tx, shipmentId: string, companyId: string, why: string) {
    return tx
      .update(o)
      .set({ status: "cancelled", lockedUntil: null, lastError: why, updatedAt: new Date() })
      .where(and(eq(o.companyId, companyId), eq(o.shipmentId, shipmentId), inArray(o.status, ["pending", "failed"]), isNull(o.deletedAt)))
      .returning({ id: o.id });
  }

  // Rows that have not reached the shipment yet (pending or failed) for the given records.
  // The company's gate records that still owe their shipment an update (pending or failed); with
  // `movementIds`, only among those records (the operations facts of a few shipments).
  async unsentMovementIds(companyId: string, movementIds?: string[]): Promise<string[]> {
    if (movementIds && !movementIds.length) return [];
    const rows = await db
      .selectDistinct({ movementId: o.movementId })
      .from(o)
      .where(and(eq(o.companyId, companyId), isNull(o.deletedAt), inArray(o.status, ["pending", "failed"]), movementIds ? inArray(o.movementId, movementIds) : undefined));
    return rows.map((r) => r.movementId);
  }

  // The delivery line's figures (unsentHealth: failed for good, or still pending after `minutes`)
  // per shipment, for these shipments only — one grouped statement. Shipments with none are left out.
  async unsentHealthByShipment(minutes: number, companyId: string, shipmentIds: string[]): Promise<Map<string, { failed: number; stalePending: number }>> {
    if (!shipmentIds.length) return new Map();
    const rows = await db
      .select({
        shipmentId: o.shipmentId,
        failed: sql<number>`count(*) FILTER (WHERE ${o.status} = 'failed')`,
        stale: sql<number>`count(*) FILTER (WHERE ${o.status} = 'pending' AND ${o.createdAt} < now() - make_interval(mins => ${minutes}))`,
      })
      .from(o)
      .where(and(eq(o.companyId, companyId), inArray(o.status, ["pending", "failed"]), isNull(o.deletedAt), inArray(o.shipmentId, shipmentIds)))
      .groupBy(o.shipmentId);
    return new Map(rows.map((r) => [r.shipmentId, { failed: Number(r.failed ?? 0), stalePending: Number(r.stale ?? 0) }]));
  }

  /**
   * The Warehouse Released days the gate's own WH releases wrote to this shipment: its "released" rows sent, of any
   * gate record of the shipment (a voided release, a record before this one, one with no task or an earlier task -
   * round-4 review). A row whose day was not written (a day set in Shipments kept, markDayKept) wrote nothing and
   * is not one. Such a day on the shipment is the gate's, not a release made in Shipments (shipments
   * gateRelease.service warehouseReleasedOf). Read by the shipment index (migration 0027). `movementId` is kept
   * for the callers; the shipment decides.
   */
  async sentReleasedDays(companyId: string, _movementId: string, shipmentId: string): Promise<string[]> {
    const day = sql<string>`${o.payload}->>'warehouseReleasedDate'`;
    const rows = await db
      .selectDistinct({ day })
      .from(o)
      .where(
        and(
          eq(o.companyId, companyId),
          eq(o.shipmentId, shipmentId),
          eq(o.kind, "released"),
          eq(o.status, "sent"),
          isNull(o.deletedAt),
          sql`${day} IS NOT NULL`,
          sql`${o.payload}->>'dayKept' IS NULL`,
        ),
      );
    return rows.map((r) => r.day).filter(Boolean);
  }

  /** A "released" row whose day Shipments kept (a day set there): marked so it never counts as the gate's day. */
  async markDayKept(id: string, companyId: string): Promise<void> {
    await db
      .update(o)
      .set({ payload: sql`${o.payload} || '{"dayKept":"true"}'::jsonb` })
      .where(and(eq(o.id, id), eq(o.companyId, companyId)));
  }

  async openForMovements(movementIds: string[], companyId: string) {
    if (!movementIds.length) return [];
    return db
      .select()
      .from(o)
      .where(and(eq(o.companyId, companyId), inArray(o.movementId, movementIds), inArray(o.status, ["pending", "failed"])))
      .orderBy(asc(o.createdAt));
  }

  async forMovement(movementId: string, companyId: string) {
    return db.select().from(o).where(and(eq(o.movementId, movementId), eq(o.companyId, companyId))).orderBy(asc(o.createdAt));
  }

  // "Retry now": pending rows become due straight away, failed rows go back to pending with a
  // fresh count. A row being sent right now keeps its claim (it is not sent twice). Older pending
  // rows of the same shipments become due too — updates of a shipment go out in order, so they
  // would hold this record's rows back. Returns this record's rows changed.
  async retryNow(movementId: string, companyId: string) {
    const keepClaim = sql`CASE WHEN ${o.lockedUntil} > now() THEN ${o.lockedUntil} ELSE NULL END`;
    // Due by the database's clock, which the claim reads ("next_attempt_at <= now()"): stamped with
    // the app's clock, a database clock a moment behind would not find the row due yet, and the send
    // right after would leave it for the next round.
    const dueNow = sql`now()`;
    return db.transaction(async (tx) => {
      const rows = await tx
        .update(o)
        .set({
          status: "pending",
          nextAttemptAt: dueNow,
          lockedUntil: keepClaim,
          attempts: sql`CASE WHEN ${o.status} = 'failed' THEN 0 ELSE ${o.attempts} END`,
          updatedAt: new Date(),
        })
        .where(and(eq(o.movementId, movementId), eq(o.companyId, companyId), inArray(o.status, ["pending", "failed"])))
        .returning();
      const shipmentIds = [...new Set(rows.map((r) => r.shipmentId))];
      if (shipmentIds.length) {
        await tx
          .update(o)
          .set({ nextAttemptAt: dueNow, lockedUntil: keepClaim, updatedAt: new Date() })
          .where(and(eq(o.companyId, companyId), inArray(o.shipmentId, shipmentIds), eq(o.status, "pending"), isNull(o.deletedAt)));
      }
      return rows;
    });
  }

  // Health of the company's shipment updates: how many are being retried or stopped, and the
  // oldest one still being retried.
  async health(companyId: string) {
    const [row] = await db
      .select({
        pending: sql<number>`count(*) FILTER (WHERE ${o.status} = 'pending')`,
        failed: sql<number>`count(*) FILTER (WHERE ${o.status} = 'failed')`,
        oldest: sql<Date | string | null>`min(${o.createdAt}) FILTER (WHERE ${o.status} = 'pending')`,
      })
      .from(o)
      .where(and(eq(o.companyId, companyId), isNull(o.deletedAt), inArray(o.status, ["pending", "failed"])));
    const oldest = row?.oldest ? new Date(row.oldest) : null;
    return {
      pending: Number(row?.pending ?? 0),
      failed: Number(row?.failed ?? 0),
      // A failed row no longer holds the later rows of its shipment back (only pending ones do).
      blockedByFailed: 0,
      oldestPendingAt: oldest ? oldest.toISOString() : null,
    };
  }

  // The record's rows that failed for good ("Not sent"), oldest first.
  async failedForMovement(movementId: string, companyId: string): Promise<ShipmentOutboxRecord[]> {
    return this.failedWhere(companyId, eq(o.movementId, movementId));
  }

  // Failed rows the user has settled by hand in Shipments.
  async dismissFailed(movementId: string, companyId: string) {
    return db
      .update(o)
      .set({ status: "cancelled", lastError: sql`${o.lastError} || ' (dismissed)'`, updatedAt: new Date() })
      .where(and(eq(o.movementId, movementId), eq(o.companyId, companyId), eq(o.status, "failed")))
      .returning();
  }
}

export const shipmentOutboxRepository = new ShipmentOutboxRepository();
