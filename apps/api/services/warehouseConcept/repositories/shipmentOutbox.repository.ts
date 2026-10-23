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
    super(db, shipmentOutboxTable, "warehouse_shipment_outbox", { orderKey: "shipment_id", sentAfterCancelNote: "sent just before the stamp was voided" });
  }

  // Written in the stamp's own transaction, so the stamp and what it owes the shipment are
  // committed together (or not at all).
  async enqueue(tx: Tx, rows: NewShipmentOutboxRecord[]) {
    if (!rows.length) return [];
    return tx.insert(o).values(rows).returning();
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
  // The company's gate records that still owe their shipment an update (pending or failed).
  async unsentMovementIds(companyId: string): Promise<string[]> {
    const rows = await db
      .selectDistinct({ movementId: o.movementId })
      .from(o)
      .where(and(eq(o.companyId, companyId), isNull(o.deletedAt), inArray(o.status, ["pending", "failed"])));
    return rows.map((r) => r.movementId);
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
    return db.transaction(async (tx) => {
      const rows = await tx
        .update(o)
        .set({
          status: "pending",
          nextAttemptAt: new Date(),
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
          .set({ nextAttemptAt: new Date(), lockedUntil: keepClaim, updatedAt: new Date() })
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
