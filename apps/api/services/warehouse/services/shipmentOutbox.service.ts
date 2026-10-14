import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { shipments } from "~encore/clients";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { shipmentOutboxRepository } from "../repositories/shipmentOutbox.repository";
import type { OutboxKind, ShipmentOutboxRecord } from "../schemas/shipmentOutbox.schema";
import type { GateShipmentUpdateState } from "../interfaces/gate.interfaces";

// Delivery of the shipment updates the gate stamps owe (the outbox). Each row is sent as the
// user who stamped — Encore passes that identity on the internal call (`authData`), so Shipments
// checks it exactly as for the user's own request; nothing goes through the public gateway.
// Rows are sent right after the stamp; what fails is retried by the warehouse-shipment-outbox
// cron (and the local timer, see startOutboxTimer) with a growing wait.

/** Attempts after which a row stops retrying and is reported as failed. */
export const MAX_ATTEMPTS = 15;
const BATCH = 20;
const TICK_MS = 60_000;
// Errors that a retry cannot fix: the shipment is gone, the update is refused, or the user may
// no longer change it.
const PERMANENT = new Set(["not_found", "invalid_argument", "permission_denied", "unauthenticated", "failed_precondition"]);

export const OUTBOX_WHAT: Record<OutboxKind, string> = {
  received: "warehouse received date",
  released: "warehouse released date",
  plate: "plate number",
};

/** Minutes to wait before the next try after `attempts` tries: 2, 4, 8 … up to an hour. */
export const retryDelayMinutes = (attempts: number) => Math.min(2 ** Math.max(1, attempts), 60);

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 500);
const errCode = (err: unknown) => (err instanceof APIError ? String(err.code) : String((err as { code?: unknown })?.code ?? ""));

async function deliver(row: ShipmentOutboxRecord): Promise<"sent" | "retry" | "failed"> {
  const what = OUTBOX_WHAT[row.kind] ?? row.kind;
  try {
    await shipments.shipmentUpdate(
      { shipmentId: row.shipmentId, ...row.payload },
      { authData: { userID: row.actingUserId, companyID: row.companyId, role: row.actingRole } },
    );
  } catch (err) {
    const error = errText(err);
    if (PERMANENT.has(errCode(err)) || row.attempts >= MAX_ATTEMPTS) {
      await shipmentOutboxRepository.markFailed(row.id, row.attempts, error);
      await gateMovementRepository.appendEvents(row.movementId, row.companyId, [
        { kind: "shipmentUpdateFailed", label: `Shipment not updated: ${what}`, at: new Date().toISOString(), by: "Shipments", detail: error },
      ]);
      log.error(err, "warehouse: shipment update from the gate failed for good", { outboxId: row.id, movementId: row.movementId, shipmentId: row.shipmentId });
      return "failed";
    }
    await shipmentOutboxRepository.markRetry(row.id, row.attempts, error, new Date(Date.now() + retryDelayMinutes(row.attempts) * 60_000));
    log.warn("warehouse: shipment update from the gate will be retried", { outboxId: row.id, movementId: row.movementId, attempts: row.attempts, error });
    return "retry";
  }
  const was = await shipmentOutboxRepository.markSent(row.id, row.attempts);
  // null: another run took the row again (this call outlived its claim) and reports it.
  if (was === "pending") {
    await gateMovementRepository.appendEvents(row.movementId, row.companyId, [
      { kind: "shipmentUpdated", label: `Shipment updated: ${what}`, at: new Date().toISOString(), by: "Shipments" },
    ]);
  } else if (was === "cancelled") {
    // The stamp was voided while this update was on its way: the shipment got it anyway.
    await gateMovementRepository.appendEvents(row.movementId, row.companyId, [
      {
        kind: "shipmentMayNeedCorrecting",
        label: "Shipment may need correcting",
        at: new Date().toISOString(),
        by: "Shipments",
        detail: `its ${what} was set just before the stamp was voided and is not changed back — correct it in Shipments if needed`,
      },
    ]);
  }
  return "sent";
}

/**
 * Sends what is due, oldest first (one shipment's updates in order). With a movement id, only
 * that record's rows — the attempt made straight after a stamp; with `shipmentIds`, only those
 * shipments' rows. Never throws.
 */
export async function deliverDue(only?: string | { shipmentIds: string[] }): Promise<{ sent: number; retry: number; failed: number }> {
  const filter = typeof only === "string" ? { movementId: only } : (only ?? {});
  const out = { sent: 0, retry: 0, failed: 0 };
  try {
    // A few rounds: a delivered row can make the next update of the same shipment due.
    for (let round = 0; round < 5; round++) {
      const rows = await shipmentOutboxRepository.claimDue(BATCH, filter);
      if (!rows.length) break;
      const sentBefore = out.sent;
      for (const row of rows) out[await deliver(row)]++;
      if (out.sent === sentBefore && rows.length < BATCH) break;
    }
  } catch (err) {
    log.error(err, "warehouse: shipment update delivery run failed");
  }
  return out;
}

/** What a record still owes its shipment, for the gate job; null when nothing is open. */
export function shipmentUpdateState(rows: ShipmentOutboxRecord[]): GateShipmentUpdateState | null {
  if (!rows.length) return null;
  const pending = rows.filter((r) => r.status === "pending");
  const shown = pending.length ? pending : rows;
  const last = shown.at(-1)!;
  return {
    state: pending.length ? "pending" : "failed",
    what: [...new Set(shown.map((r) => OUTBOX_WHAT[r.kind] ?? r.kind))],
    attempts: Math.max(...shown.map((r) => r.attempts)),
    lastError: last.lastError,
    nextAttemptAt: pending.length ? new Date(Math.min(...pending.map((r) => r.nextAttemptAt.getTime()))).toISOString() : null,
  };
}

/** A pending update older than this is reported as a warning (it should have reached Shipments). */
export const STALE_PENDING_MINUTES = 10;

/** Logs a warning when shipment updates wait longer than STALE_PENDING_MINUTES. Never throws. */
export async function warnStaleOutbox(): Promise<number> {
  try {
    const { count, oldest } = await shipmentOutboxRepository.stalePending(STALE_PENDING_MINUTES);
    if (count) log.warn("warehouse: shipment updates from the gate are waiting longer than expected", { count, oldest, minutes: STALE_PENDING_MINUTES });
    return count;
  } catch (err) {
    log.error(err, "warehouse: shipment update health check failed");
    return 0;
  }
}

let started = false;

// Encore cron jobs do not fire under `encore run`, so a minute timer does the same job locally
// (as fx does). In the cloud both run; claiming rows with SKIP LOCKED keeps them apart.
export function startOutboxTimer(): void {
  if (started || process.env.VITEST) return;
  started = true;
  setInterval(() => void deliverDue().then(() => warnStaleOutbox()), TICK_MS).unref();
}
