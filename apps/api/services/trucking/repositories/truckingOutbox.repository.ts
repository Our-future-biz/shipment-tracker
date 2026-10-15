import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, type Tx } from "../db/db";
import { truckingOutboxTable, type NewTruckingOutboxRecord, type TruckingOutboxRecord } from "../schemas/truckingOutbox.schema";
import { OutboxRepository } from "../../../lib/outbox/outboxRepository";

const o = truckingOutboxTable;

/** A row to enqueue, without the company (added here). */
export type TruckingOutboxInput = Omit<NewTruckingOutboxRecord, "companyId" | "id">;

// Claiming and settling (claimDueRows, markSent, markRetry, markFailed, stalePending) come from
// the shared OutboxRepository; what is particular to Trucking is here.
class TruckingOutboxRepository extends OutboxRepository<typeof truckingOutboxTable> {
  constructor() {
    // Updates of one job go out in the order they were made; a row cancelled while on its way
    // (the job was deleted) is recorded as sent with this note.
    super(db, truckingOutboxTable, "trucking_outbox", { orderKey: "shipment_id", sentAfterCancelNote: "sent just before the job was deleted" });
  }

  /** Written in the transaction of the change that owes it. */
  async enqueue(tx: Tx, companyId: string, rows: TruckingOutboxInput[]): Promise<void> {
    if (!rows.length) return;
    await tx.insert(o).values(rows.map((r) => ({ ...r, companyId })));
  }

  /** Due rows (see OutboxRepository.claimDueRows); with a consignment, only its rows (the delivery right after a change). */
  async claimDue(limit: number, consignmentId?: string): Promise<TruckingOutboxRecord[]> {
    const ids = await this.claimDueRows(limit, consignmentId ? sql`AND x.consignment_id = ${consignmentId}` : sql``);
    if (!ids.length) return [];
    return db.select().from(o).where(inArray(o.id, ids)).orderBy(asc(o.createdAt), asc(o.id));
  }

  /** A deleted job: everything still owed to it (pending or failed) is cancelled. */
  async cancelForShipment(tx: Tx, companyId: string, shipmentId: string, why: string): Promise<number> {
    const rows = await tx
      .update(o)
      .set({ status: "cancelled", lockedUntil: null, lastError: why, updatedAt: new Date() })
      .where(and(eq(o.companyId, companyId), eq(o.shipmentId, shipmentId), inArray(o.status, ["pending", "failed"]), isNull(o.deletedAt)))
      .returning({ id: o.id });
    return rows.length;
  }
}

export const truckingOutboxRepository = new TruckingOutboxRepository();
