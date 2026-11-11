import { asc, inArray, sql } from "drizzle-orm";
import { db } from "../db/db";
import { shipmentEventOutboxTable, type ShipmentEventOutboxRecord } from "../schemas/shipmentEventOutbox.schema";
import { OutboxRepository } from "../../../lib/outbox/outboxRepository";

const o = shipmentEventOutboxTable;

// The `shipment-deleted` events deletes owe (schemas/shipmentEventOutbox). Claiming and settling come
// from the shared OutboxRepository; the events of one shipment go out in the order they were made.
class ShipmentEventOutboxRepository extends OutboxRepository<typeof shipmentEventOutboxTable> {
  constructor() {
    super(db, shipmentEventOutboxTable, "shipment_event_outbox", { orderKey: "shipment_id", sentAfterCancelNote: "published just before it was cancelled" });
  }

  // Takes up to `limit` due rows; with `shipmentId`, only that shipment's (the publish straight after its delete).
  async claimDue(limit: number, shipmentId?: string): Promise<ShipmentEventOutboxRecord[]> {
    const ids = await this.claimDueRows(limit, shipmentId ? sql`AND x.shipment_id = ${shipmentId}` : sql``);
    if (!ids.length) return [];
    return db.select().from(o).where(inArray(o.id, ids)).orderBy(asc(o.createdAt), asc(o.id));
  }
}

export const shipmentEventOutboxRepository = new ShipmentEventOutboxRepository();
