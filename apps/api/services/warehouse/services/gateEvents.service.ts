import log from "encore.dev/log";
import { gateEventOutboxRepository } from "../repositories/gateEventOutbox.repository";
import type { GateEventOutboxRecord, NewGateEventOutboxRecord } from "../schemas/gateEventOutbox.schema";
import type { Tx } from "../repositories/warehouseSection.repository";
import { warehouseGateStamped } from "../topics";
import { deliverOutboxRow, runOutboxDelivery, type OutboxHandlers } from "../../../lib/outbox/outboxDelivery";
import { gateStampedEvents, type GateStampedChange } from "./gateEvents";

// The `warehouse-gate-stamped` topic, published after commit. A stamp (or a void) writes its
// events to warehouse_gate_event_outbox inside its own transaction (enqueueGateEvents); after the
// transaction commits, the caller publishes them (deliverGateEvents with the record's id) — the
// same place the shipment write-back is delivered. What could not be published then is retried by
// the warehouse-shipment-outbox cron (and the local minute timer). A rolled-back stamp leaves no
// row, so nothing is ever published for it.

const handlers: OutboxHandlers<GateEventOutboxRecord> = {
  async send(row) {
    await warehouseGateStamped.publish(row.event);
  },
  errorText: () => "The gate event could not be published",
  async onFailed(row, error, err) {
    await gateEventOutboxRepository.markFailed(row.id, row.attempts, error);
    log.error(err, "warehouse: gate event not published for good", { outboxId: row.id, movementId: row.movementId, kind: row.event.kind });
  },
  async onRetry(row, error, nextAttemptAt, err) {
    await gateEventOutboxRepository.markRetry(row.id, row.attempts, error, nextAttemptAt);
    log.warn("warehouse: gate event will be published again", { outboxId: row.id, movementId: row.movementId, error: err instanceof Error ? err.message : String(err) });
  },
  async onSent(row) {
    await gateEventOutboxRepository.markSent(row.id, row.attempts);
  },
};

/** Writes the events a stamp / void owes, in its transaction. Returns how many. */
export async function enqueueGateEvents(tx: Tx, change: GateStampedChange, actingRole: string): Promise<number> {
  const events = gateStampedEvents(change);
  const rows: NewGateEventOutboxRecord[] = events.map((event) => ({
    companyId: change.companyId,
    movementId: change.movementId,
    event,
    actingUserId: change.userId,
    actingRole,
  }));
  await gateEventOutboxRepository.enqueue(tx, rows);
  return rows.length;
}

/** Publishes what is due (with a movement id, only that record's events). Never throws. */
export async function deliverGateEvents(movementId?: string) {
  return runOutboxDelivery({
    claim: (limit) => gateEventOutboxRepository.claimDue(limit, movementId),
    deliver: (row) => deliverOutboxRow(row, handlers),
    onError: (err) => log.error(err, "warehouse: gate event publish run failed"),
  });
}
