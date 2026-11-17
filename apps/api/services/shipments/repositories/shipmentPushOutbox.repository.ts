import { asc, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "../db/db";
import { shipmentPushOutboxTable, type NewShipmentPushOutboxRecord, type ShipmentPushOutboxRecord } from "../schemas/shipmentPushOutbox.schema";
import { OutboxRepository } from "../../../lib/outbox/outboxRepository";

const o = shipmentPushOutboxTable;

// The shipment changes owed to Trucking and the gate (schemas/shipmentPushOutbox). Claiming and
// settling come from the shared OutboxRepository; one shipment's changes go out in the order made,
// so a later change never overtakes an earlier one.
class ShipmentPushOutboxRepository extends OutboxRepository<typeof shipmentPushOutboxTable> {
  constructor() {
    super(db, shipmentPushOutboxTable, "shipment_push_outbox", { orderKey: "shipment_id", sentAfterCancelNote: "sent just before it was cancelled" });
  }

  /** Writes the rows in the shipment write's transaction. */
  async enqueue(tx: Tx, rows: NewShipmentPushOutboxRecord[]): Promise<void> {
    if (rows.length) await tx.insert(o).values(rows);
  }

  // Takes up to `limit` due rows; with `shipmentId`, only that shipment's (the send straight after its write).
  async claimDue(limit: number, shipmentId?: string): Promise<ShipmentPushOutboxRecord[]> {
    const ids = await this.claimDueRows(limit, shipmentId ? sql`AND x.shipment_id = ${shipmentId}` : sql``);
    if (!ids.length) return [];
    return db.select().from(o).where(inArray(o.id, ids)).orderBy(asc(o.createdAt), asc(o.id));
  }
}

export const shipmentPushOutboxRepository = new ShipmentPushOutboxRepository();
