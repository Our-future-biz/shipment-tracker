import { APIError, ErrCode } from "encore.dev/api";
import log from "encore.dev/log";
import { trucking, warehouseConcept } from "~encore/clients";
import { shipmentPushOutboxRepository } from "../repositories/shipmentPushOutbox.repository";
import type { NewShipmentPushOutboxRecord, ShipmentPushOutboxRecord } from "../schemas/shipmentPushOutbox.schema";
import { deliverOutboxRow, runOutboxDelivery, type OutboxHandlers } from "../../../lib/outbox/outboxDelivery";
import { actingAuthNow } from "../../../lib/outbox/shipmentUpdateAs";
import { serviceActor } from "../../../lib/outbox/serviceIdentity";
import { parseShipmentChanges, pushesOwed } from "../../../lib/shipmentPush";
import type { Tx } from "../db/db";

// A person's change of a shipment, sent to Trucking's jobs and the gate records of the shipment
// (lib/shipmentPush). The write turn stores the rows (owePushes); after the commit the write sends
// them (deliverShipmentPushes with the shipment's id); what could not go then is retried by the
// shipments-push-outbox cron (and the local minute timer). Each side takes a change by its own
// rules and answers what it kept instead - a refusal there never fails the shipment's save.

/**
 * Stores, in the shipment write's turn, what the write owes Trucking and the gate. Only a person's
 * write owes anything (`byPerson`: an edit, or the master job's values a person saved): the app's
 * own writes - Trucking's and the gate's updates of the shipment - would only loop back.
 */
export async function owePushes(
  tx: Tx,
  row: { companyId: string; shipmentId: string; userId: string; role?: string },
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
  written: readonly string[],
  byPerson: boolean,
): Promise<boolean> {
  if (!byPerson) return false;
  const owed = pushesOwed(before, after, written);
  const rows: NewShipmentPushOutboxRecord[] = owed.map(({ target, changes }) => ({
    companyId: row.companyId,
    shipmentId: row.shipmentId,
    target,
    changes,
    actingUserId: row.userId,
    actingRole: row.role ?? "user",
  }));
  if (!rows.length) return false;
  await shipmentPushOutboxRepository.enqueue(tx, rows);
  return true;
}

// Sent as the user who made the change; one who has left since is replaced by the company's service identity.
async function callAs(row: ShipmentPushOutboxRecord) {
  try {
    return await actingAuthNow(row);
  } catch (err) {
    if (!(err instanceof APIError && err.code === ErrCode.PermissionDenied)) throw err;
    return serviceActor(row.companyId);
  }
}

const handlers: OutboxHandlers<ShipmentPushOutboxRecord> = {
  async send(row) {
    const authData = await callAs(row);
    const req = { shipmentId: row.shipmentId, changes: parseShipmentChanges(row.changes) };
    const { kept } = row.target === "trucking" ? await trucking._internalShipmentChanged(req, { authData }) : await warehouseConcept._internalShipmentChanged(req, { authData });
    if (kept.length) log.info("shipments: a change was kept out where the other side holds its own", { outboxId: row.id, shipmentId: row.shipmentId, target: row.target, kept });
  },
  errorText: (err) =>
    err instanceof APIError && err.code === ErrCode.Unavailable ? "Trucking or the warehouse could not be reached" : "The shipment's change could not be passed on",
  async onFailed(row, error, err) {
    await shipmentPushOutboxRepository.markFailed(row.id, row.attempts, error);
    log.error(err, "shipments: a shipment's change not passed on for good", { outboxId: row.id, shipmentId: row.shipmentId, target: row.target });
  },
  async onRetry(row, error, nextAttemptAt, err) {
    await shipmentPushOutboxRepository.markRetry(row.id, row.attempts, error, nextAttemptAt);
    log.warn("shipments: a shipment's change will be passed on again", { outboxId: row.id, shipmentId: row.shipmentId, target: row.target, error: err instanceof Error ? err.message : String(err) });
  },
  async onSent(row) {
    await shipmentPushOutboxRepository.markSent(row.id, row.attempts);
  },
};

/** Sends what is due (with a shipment id, only that shipment's changes). Never throws. */
export async function deliverShipmentPushes(shipmentId?: string) {
  return runOutboxDelivery({
    claim: (limit) => shipmentPushOutboxRepository.claimDue(limit, shipmentId),
    deliver: (row) => deliverOutboxRow(row, handlers),
    onError: (err) => log.error(err, "shipments: shipment push run failed"),
  });
}

const TICK_MS = 60_000;
let started = false;

// Encore cron jobs do not fire under `encore run`, so a minute timer does the same job locally (as
// the other outboxes do). In the cloud both run; SKIP LOCKED claims keep them apart.
export function startShipmentPushTimer(): void {
  if (started || process.env.VITEST) return;
  started = true;
  setInterval(() => void deliverShipmentPushes(), TICK_MS).unref();
}
