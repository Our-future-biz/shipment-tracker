import log from "encore.dev/log";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { shipmentOutboxRepository } from "../repositories/shipmentOutbox.repository";
import { gateEventOutboxRepository } from "../repositories/gateEventOutbox.repository";
import type { OutboxKind, ShipmentOutboxRecord } from "../schemas/shipmentOutbox.schema";
import type { GateShipmentUpdateState } from "../interfaces/gate.interfaces";
import { OUTBOX_MAX_ATTEMPTS, outboxErrorCode } from "../../../lib/outbox/outboxRetry";
import { deliverOutboxRow, runOutboxDelivery, type OutboxHandlers } from "../../../lib/outbox/outboxDelivery";
import { sendShipmentUpdateAs } from "../../../lib/outbox/shipmentUpdateAs";
import { deliverGateEvents } from "./gateEvents.service";

// Delivery of the shipment updates the gate stamps owe (the outbox). Each row is sent as the
// user who stamped (sendShipmentUpdateAs). Rows are sent right after the stamp; what fails is
// retried by the warehouse-shipment-outbox cron (and the local timer, see startOutboxTimer) with
// a growing wait; what fails for good is shown on the record and a manager can send it again
// (gateSendAgain.service). The retry rules and the delivery loop are shared (lib/outbox); what a
// gate stamp records about its delivery is here.

/** Attempts after which a row stops retrying and is reported as failed. */
export const MAX_ATTEMPTS = OUTBOX_MAX_ATTEMPTS;
const TICK_MS = 60_000;

export const OUTBOX_WHAT: Record<OutboxKind, string> = {
  received: "warehouse received date",
  released: "warehouse released date",
  plate: "plate number",
};

// What users see of a failed delivery (stored as last_error and in the gate history): our own
// wording by error code, never the upstream text, which is logged instead.
export function outboxErrorText(err: unknown): string {
  switch (outboxErrorCode(err)) {
    case "not_found":
      return "The shipment no longer exists in Shipments";
    case "permission_denied":
    case "unauthenticated":
      return "The user who stamped may no longer change this shipment";
    case "invalid_argument":
    case "failed_precondition":
      return "Shipments refused the update";
    case "unavailable":
    case "deadline_exceeded":
      return "Shipments did not answer";
    default:
      return "The update could not be sent";
  }
}

const what = (row: ShipmentOutboxRecord) => OUTBOX_WHAT[row.kind] ?? row.kind;

// How a gate stamp's row is sent and settled: failures and deliveries land in the record's
// gate history.
const handlers: OutboxHandlers<ShipmentOutboxRecord> = {
  send: sendShipmentUpdateAs,
  errorText: outboxErrorText,
  async onFailed(row, error, err) {
    await shipmentOutboxRepository.markFailed(row.id, row.attempts, error);
    await gateMovementRepository.appendEvents(row.movementId, row.companyId, [
      { kind: "shipmentUpdateFailed", label: `Shipment not updated: ${what(row)}`, at: new Date().toISOString(), by: "Shipments", detail: error },
    ]);
    log.error(err, "warehouse: shipment update from the gate failed for good", { outboxId: row.id, movementId: row.movementId, shipmentId: row.shipmentId, error });
  },
  async onRetry(row, error, nextAttemptAt, err) {
    await shipmentOutboxRepository.markRetry(row.id, row.attempts, error, nextAttemptAt);
    log.warn("warehouse: shipment update from the gate will be retried", {
      outboxId: row.id,
      movementId: row.movementId,
      attempts: row.attempts,
      error: err instanceof Error ? err.message : String(err),
    });
  },
  async onSent(row) {
    const was = await shipmentOutboxRepository.markSent(row.id, row.attempts);
    // null: another run took the row again (this call outlived its claim) and reports it.
    if (was === "pending") {
      await gateMovementRepository.appendEvents(row.movementId, row.companyId, [
        { kind: "shipmentUpdated", label: `Shipment updated: ${what(row)}`, at: new Date().toISOString(), by: "Shipments" },
      ]);
    } else if (was === "cancelled") {
      // The stamp was voided while this update was on its way: the shipment got it anyway.
      await gateMovementRepository.appendEvents(row.movementId, row.companyId, [
        {
          kind: "shipmentMayNeedCorrecting",
          label: "Shipment may need correcting",
          at: new Date().toISOString(),
          by: "Shipments",
          detail: `its ${what(row)} was set just before the stamp was voided and is not changed back — correct it in Shipments if needed`,
        },
      ]);
    }
  },
};

/**
 * Sends what is due, oldest first (one shipment's updates in order). With a movement id, only
 * that record's rows — the attempt made straight after a stamp; with `shipmentIds`, only those
 * shipments' rows. Never throws.
 */
export async function deliverDue(only?: string | { shipmentIds: string[] }): Promise<{ sent: number; retry: number; failed: number }> {
  const filter = typeof only === "string" ? { movementId: only } : (only ?? {});
  return runOutboxDelivery({
    claim: (limit) => shipmentOutboxRepository.claimDue(limit, filter),
    deliver: (row) => deliverOutboxRow(row, handlers),
    onError: (err) => log.error(err, "warehouse: shipment update delivery run failed"),
  });
}

/** What a record still owes its shipment, for the gate job; null when nothing is open. */
export function shipmentUpdateState(rows: ShipmentOutboxRecord[]): GateShipmentUpdateState | null {
  if (!rows.length) return null;
  const pending = rows.filter((r) => r.status === "pending");
  const shown = pending.length ? pending : rows;
  const last = shown.at(-1)!;
  return {
    state: pending.length ? "pending" : "failed",
    what: [...new Set(shown.map(what))],
    attempts: Math.max(...shown.map((r) => r.attempts)),
    lastError: last.lastError,
    nextAttemptAt: pending.length ? new Date(Math.min(...pending.map((r) => r.nextAttemptAt.getTime()))).toISOString() : null,
  };
}

/** A pending update older than this is reported as a warning (it should have reached Shipments). */
export const STALE_PENDING_MINUTES = 10;

/**
 * Logs a warning when shipment updates or gate events (for Trucking) failed for good or wait
 * longer than STALE_PENDING_MINUTES. The records show them ("Not sent") and a manager can send
 * them again. Returns how many. Never throws.
 */
export async function warnStaleOutbox(): Promise<number> {
  let n = 0;
  const outboxes = [
    { repo: shipmentOutboxRepository, what: "shipment updates from the gate" },
    { repo: gateEventOutboxRepository, what: "gate events for Trucking" },
  ];
  for (const { repo, what } of outboxes) {
    try {
      const { failed, stalePending, oldestPending } = await repo.unsentHealth(STALE_PENDING_MINUTES);
      if (failed) log.warn(`warehouse: ${what} failed for good and wait for a manager to send them again`, { failed });
      if (stalePending) log.warn(`warehouse: ${what} are waiting longer than expected`, { count: stalePending, oldest: oldestPending, minutes: STALE_PENDING_MINUTES });
      n += failed + stalePending;
    } catch (err) {
      log.error(err, `warehouse: health check of ${what} failed`);
    }
  }
  return n;
}

let started = false;

// Encore cron jobs do not fire under `encore run`, so a minute timer does the same job locally
// (as fx does). In the cloud both run; claiming rows with SKIP LOCKED keeps them apart.
export function startOutboxTimer(): void {
  if (started || process.env.VITEST) return;
  started = true;
  setInterval(() => void deliverDue().then(() => deliverGateEvents()).then(() => warnStaleOutbox()), TICK_MS).unref();
}
