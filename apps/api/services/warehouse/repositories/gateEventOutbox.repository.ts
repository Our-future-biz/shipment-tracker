import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/db";
import { gateEventOutboxTable, type GateEventOutboxRecord, type NewGateEventOutboxRecord } from "../schemas/gateEventOutbox.schema";
import type { Tx } from "./warehouseSection.repository";
import { OutboxRepository } from "../../../lib/outbox/outboxRepository";

const o = gateEventOutboxTable;

// The `warehouse-gate-stamped` events gate stamps owe (see topics.ts). Claiming and settling come
// from the shared OutboxRepository; events of one gate record go out in the order they were made
// (a failed one does not hold the later ones back: it is shown and a manager can send it again).
class GateEventOutboxRepository extends OutboxRepository<typeof gateEventOutboxTable> {
  constructor() {
    super(db, gateEventOutboxTable, "warehouse_gate_event_outbox", { orderKey: "movement_id", sentAfterCancelNote: "published just before it was cancelled" });
  }

  // Written in the stamp's own transaction: the stamp and its event commit together, or neither.
  async enqueue(tx: Tx, rows: NewGateEventOutboxRecord[]) {
    if (!rows.length) return [];
    return tx.insert(o).values(rows).returning();
  }

  // Takes up to `limit` due rows (OutboxRepository.claimDueRows); with `movementId`, only that
  // record's rows — the publish straight after a stamp.
  async claimDue(limit: number, movementId?: string): Promise<GateEventOutboxRecord[]> {
    const ids = await this.claimDueRows(limit, movementId ? sql`AND x.movement_id = ${movementId}` : sql``);
    if (!ids.length) return [];
    return db.select().from(o).where(inArray(o.id, ids)).orderBy(asc(o.createdAt), asc(o.id));
  }

  // The record's events that could not be published for good ("Not sent"), oldest first.
  async failedForMovement(movementId: string, companyId: string): Promise<GateEventOutboxRecord[]> {
    return this.failedWhere(companyId, eq(o.movementId, movementId));
  }
}

export const gateEventOutboxRepository = new GateEventOutboxRepository();
