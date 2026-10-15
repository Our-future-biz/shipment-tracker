import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/db";
import { shipmentOutboxTable, type NewShipmentOutboxRecord, type ShipmentOutboxRecord } from "../schemas/shipmentOutbox.schema";
import type { Tx } from "./warehouseSection.repository";

const o = shipmentOutboxTable;
// A claimed row is held this long; a delivery that dies leaves it to the next run after that.
const LOCK = sql`interval '2 minutes'`;

class ShipmentOutboxRepository {
  // Written in the stamp's own transaction, so the stamp and what it owes the shipment are
  // committed together (or not at all).
  async enqueue(tx: Tx, rows: NewShipmentOutboxRecord[]) {
    if (!rows.length) return [];
    return tx.insert(o).values(rows).returning();
  }

  // Takes up to `limit` due rows for delivery and counts the attempt. Safe to run from several
  // places at once (the cron and the local timer, or two app instances): rows are claimed with
  // SKIP LOCKED and held for a while. Updates of one shipment go out in the order they were
  // made — a row waits while an older one of the same shipment is still pending.
  // With `movementId`, only that record's rows (the delivery right after a stamp); with
  // `shipmentIds`, only the rows of those shipments ("Retry now").
  // Each claim adds one to `attempts`, which then serves as the claim's token: only the run
  // holding the latest claim can settle the row (markSent / markRetry / markFailed).
  async claimDue(limit: number, filter: { movementId?: string; shipmentIds?: string[] } = {}): Promise<ShipmentOutboxRecord[]> {
    const { movementId, shipmentIds } = filter;
    if (shipmentIds && !shipmentIds.length) return [];
    const res = await db.execute(sql`
      UPDATE ${o} SET locked_until = now() + ${LOCK}, attempts = attempts + 1, updated_at = now()
      WHERE id IN (
        SELECT x.id FROM ${o} x
        WHERE x.status = 'pending' AND x.deleted_at IS NULL AND x.next_attempt_at <= now()
          AND (x.locked_until IS NULL OR x.locked_until < now())
          ${movementId ? sql`AND x.movement_id = ${movementId}` : sql``}
          ${shipmentIds ? sql`AND x.shipment_id IN (${sql.join(shipmentIds.map((id) => sql`${id}`), sql`, `)})` : sql``}
          AND NOT EXISTS (
            SELECT 1 FROM ${o} y
            WHERE y.shipment_id = x.shipment_id AND y.status = 'pending' AND y.deleted_at IS NULL
              AND (y.created_at, y.id) < (x.created_at, x.id))
        ORDER BY x.created_at, x.id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
      RETURNING id`);
    const ids = (res.rows as { id: string }[]).map((r) => r.id);
    if (!ids.length) return [];
    return db.select().from(o).where(inArray(o.id, ids)).orderBy(asc(o.createdAt), asc(o.id));
  }

  // Settles a delivered row. A row cancelled meanwhile (its stamp was voided while the update
  // was on its way) is recorded as sent too, since the shipment did get it. Returns the status the
  // row had ("pending" or "cancelled"), or null when the claim was lost (another run took the
  // row again after the lock ran out and settles it).
  async markSent(id: string, attempts: number): Promise<"pending" | "cancelled" | null> {
    const res = await db.execute(sql`
      UPDATE ${o} SET status = 'sent', sent_at = now(), locked_until = NULL, updated_at = now(),
        last_error = CASE WHEN p.was = 'cancelled' THEN 'sent just before the stamp was voided' ELSE '' END
      FROM (SELECT id, status AS was FROM ${o} WHERE id = ${id} FOR UPDATE) p
      WHERE ${o}.id = p.id AND ${o}.attempts = ${attempts} AND ${o}.status IN ('pending', 'cancelled')
      RETURNING p.was`);
    const was = (res.rows as { was: string }[])[0]?.was;
    return was === "pending" || was === "cancelled" ? was : null;
  }

  async markRetry(id: string, attempts: number, error: string, nextAttemptAt: Date) {
    await db
      .update(o)
      .set({ nextAttemptAt, lockedUntil: null, lastError: error, updatedAt: new Date() })
      .where(and(eq(o.id, id), eq(o.attempts, attempts), eq(o.status, "pending")));
  }

  async markFailed(id: string, attempts: number, error: string) {
    await db
      .update(o)
      .set({ status: "failed", lockedUntil: null, lastError: error, updatedAt: new Date() })
      .where(and(eq(o.id, id), eq(o.attempts, attempts), eq(o.status, "pending")));
  }

  // A voided stamp: what it still owes the shipment is cancelled. Returns the rows of those
  // stamps as they were (to tell whether an update already reached the shipment).
  async cancelForStamps(tx: Tx, movementId: string, stamps: string[]) {
    const before = await tx
      .select()
      .from(o)
      .where(and(eq(o.movementId, movementId), inArray(o.stamp, stamps)))
      .for("update");
    await tx
      .update(o)
      .set({ status: "cancelled", lockedUntil: null, lastError: "stamp voided", updatedAt: new Date() })
      .where(and(eq(o.movementId, movementId), inArray(o.stamp, stamps), inArray(o.status, ["pending", "failed"])));
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
    return { pending: Number(row?.pending ?? 0), failed: Number(row?.failed ?? 0), oldestPendingAt: oldest ? oldest.toISOString() : null };
  }

  // Pending updates (all companies) older than `minutes`: count and the oldest, for the warning log.
  async stalePending(minutes: number) {
    const [row] = await db
      .select({ n: sql<number>`count(*)`, oldest: sql<Date | string | null>`min(${o.createdAt})` })
      .from(o)
      .where(and(eq(o.status, "pending"), isNull(o.deletedAt), sql`${o.createdAt} < now() - make_interval(mins => ${minutes})`));
    return { count: Number(row?.n ?? 0), oldest: row?.oldest ? new Date(row.oldest).toISOString() : null };
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
