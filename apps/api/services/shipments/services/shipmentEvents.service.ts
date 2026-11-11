import log from "encore.dev/log";
import { shipmentEventOutboxRepository } from "../repositories/shipmentEventOutbox.repository";
import type { ShipmentEventOutboxRecord } from "../schemas/shipmentEventOutbox.schema";
import { shipmentDeleted } from "../topics";
import { deliverOutboxRow, runOutboxDelivery, type OutboxHandlers } from "../../../lib/outbox/outboxDelivery";

// The `shipment-deleted` topic, published after commit. A delete writes its event to
// shipment_event_outbox in its own transaction (shipmentRepository.softDeleteWithEvent); after the
// commit the delete publishes it (deliverShipmentEvents with the shipment's id). What could not be
// published then is retried by the shipments-event-outbox cron (and the local minute timer).

const handlers: OutboxHandlers<ShipmentEventOutboxRecord> = {
  async send(row) {
    await shipmentDeleted.publish(row.event);
  },
  errorText: () => "The shipment's delete could not be published",
  async onFailed(row, error, err) {
    await shipmentEventOutboxRepository.markFailed(row.id, row.attempts, error);
    log.error(err, "shipments: shipment-deleted not published for good", { outboxId: row.id, shipmentId: row.shipmentId });
  },
  async onRetry(row, error, nextAttemptAt, err) {
    await shipmentEventOutboxRepository.markRetry(row.id, row.attempts, error, nextAttemptAt);
    log.warn("shipments: shipment-deleted will be published again", { outboxId: row.id, shipmentId: row.shipmentId, error: err instanceof Error ? err.message : String(err) });
  },
  async onSent(row) {
    await shipmentEventOutboxRepository.markSent(row.id, row.attempts);
  },
};

/** Publishes what is due (with a shipment id, only that shipment's events). Never throws. */
export async function deliverShipmentEvents(shipmentId?: string) {
  return runOutboxDelivery({
    claim: (limit) => shipmentEventOutboxRepository.claimDue(limit, shipmentId),
    deliver: (row) => deliverOutboxRow(row, handlers),
    onError: (err) => log.error(err, "shipments: shipment event publish run failed"),
  });
}

const TICK_MS = 60_000;
let started = false;

// Encore cron jobs do not fire under `encore run`, so a minute timer does the same job locally (as
// the warehouse and trucking outboxes do). In the cloud both run; SKIP LOCKED claims keep them apart.
export function startShipmentEventTimer(): void {
  if (started || process.env.VITEST) return;
  started = true;
  setInterval(() => void deliverShipmentEvents(), TICK_MS).unref();
}
