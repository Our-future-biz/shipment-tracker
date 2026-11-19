import log from "encore.dev/log";
import { APIError } from "encore.dev/api";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { shipmentOutboxRepository } from "../repositories/shipmentOutbox.repository";
import { gateEventOutboxRepository } from "../repositories/gateEventOutbox.repository";
import type { OutboxKind, ShipmentOutboxRecord } from "../schemas/shipmentOutbox.schema";
import type { GateShipmentUpdateState } from "../interfaces/gate.interfaces";
import { OUTBOX_MAX_ATTEMPTS, outboxErrorCode } from "../../../lib/outbox/outboxRetry";
import { deliverOutboxRow, runOutboxDelivery, type OutboxHandlers } from "../../../lib/outbox/outboxDelivery";
import { actingAuthNow, sendShipmentUpdateAs } from "../../../lib/outbox/shipmentUpdateAs";
import { shipments } from "~encore/clients";
import { deliverGateEvents } from "./gateEvents.service";
import { isReleasedMeanwhilePayload, isUncheckedPayload, overrideOfPayload, passBackOfPayload, releasedInShipmentsEvent, releasedPayloadToSend, uncheckedCauseOfPayload } from "./releasePayment";

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
  override: "release on prepayment recorded",
  passBack: "approval given back",
};

/**
 * What a row sends, in words: an "override" row may be the "Prepayment not checked" line instead (P17), and a
 * "passBack" row closes its approval when somebody else's WH release of the record was first.
 */
export const outboxWhat = (row: Pick<ShipmentOutboxRecord, "kind" | "payload">): string =>
  row.kind === "override" && isUncheckedPayload(row.payload)
    ? UNCHECKED_WHAT
    : row.kind === "passBack" && isReleasedMeanwhilePayload(row.payload)
      ? CLOSED_WHAT
      : (OUTBOX_WHAT[row.kind] ?? row.kind);
const UNCHECKED_WHAT = "prepayment not checked noted";
const CLOSED_WHAT = "approval closed, released by someone else";

// The day a "released" row did not send (Shipments' day kept), for the line its delivery leaves on the record.
const keptDays = new WeakMap<ShipmentOutboxRecord, { date: string; by: string }>();

// A "released" row: Shipments is asked again for the shipment's Warehouse Released just before the day is sent.
// The row's own day is among the gate's days of its own send: an earlier try of this very row may have written it
// while its answer was lost (or a manager sends a row that did write again), and that day is not one set in
// Shipments - else the row would keep it as such, and never count it as the gate's again (review).
async function sendReleased(row: ShipmentOutboxRecord, authData: Awaited<ReturnType<typeof actingAuthNow>>): Promise<void> {
  let released: { date: string; by: string } | null | undefined;
  let gateDays: string[] | undefined;
  try {
    const own = row.payload.warehouseReleasedDate ? [row.payload.warehouseReleasedDate] : [];
    gateDays = [...new Set([...(await shipmentOutboxRepository.sentReleasedDays(row.companyId, row.movementId, row.shipmentId)), ...own])];
    released = (await shipments._internalWarehouseReleasedOf({ shipmentId: row.shipmentId, gateDays }, { authData })).warehouseReleased;
  } catch (err) {
    log.warn(err, "warehouse: the shipment's Warehouse Released could not be read before the gate's day was sent; sent as before", { outboxId: row.id });
  }
  const { payload, kept } = releasedPayloadToSend(row.payload, released);
  if (kept) keptDays.set(row, kept);
  // Nothing left to send (no plate with it): the shipment keeps its day, and the row is done.
  if (!Object.keys(payload).length) return;
  // Shipments is asked again in the write itself (under the shipment's lock): a day a person set between the read
  // above and this write stays, and the record says so. Not asked when the read failed - the day goes as before.
  // Also when only the shipment's read failed: the day the write finds is still checked in its turn (round-4 review).
  const replaces = payload.warehouseReleasedDate ? gateDays : undefined;
  const after = await sendShipmentUpdateAs({ ...row, payload }, replaces);
  const dayNow = (after.warehouseReleasedDate ?? "").trim();
  if (replaces && dayNow && dayNow !== payload.warehouseReleasedDate) keptDays.set(row, { date: dayNow, by: "" });
}

// A row is sent as the user who stamped. The dates and the plate are a ShipmentUpdate; the override of a WH release
// on prepayment and an approval given back are Shipments' own calls for the gate (controllers/_internalReleasePass,
// services/releasePayment), sent through here so they are retried as the dates are (mock test council n27). The
// row's id goes with the override as its idempotency key: delivery is at least once, and "Send again" sends the
// same row - Shipments records it once.
async function sendRow(row: ShipmentOutboxRecord): Promise<void> {
  if (row.kind === "override" || row.kind === "passBack") {
    const authData = await actingAuthNow(row);
    if (row.kind === "override" && isUncheckedPayload(row.payload)) {
      const why = uncheckedCauseOfPayload(row.payload);
      await shipments._internalReleaseUncheckedRecord({ shipmentId: row.shipmentId, idempotencyKey: row.id, ...(why === "customerDatabase" ? { why } : {}) }, { authData });
    } else if (row.kind === "override") {
      await shipments._internalReleaseOverrideRecord({ shipmentId: row.shipmentId, kind: "warehouse_released", ...overrideOfPayload(row.payload), idempotencyKey: row.id }, { authData });
    } else {
      const answer = await shipments._internalReleasePassGiveBack(passBackOfPayload(row.payload), { authData });
      // Not given back while the approval still carries this use: shown as not sent, never marked sent. A use
      // gone already (given back by an earlier delivery of this row) has nothing left to do.
      if (!answer.givenBack && answer.stillUsed !== false) throw APIError.failedPrecondition("the approval was not given back");
    }
    return;
  }
  if (row.kind === "released") return sendReleased(row, await actingAuthNow(row));
  await sendShipmentUpdateAs(row);
}

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

const what = (row: ShipmentOutboxRecord) => outboxWhat(row);

// How a gate stamp's row is sent and settled: failures and deliveries land in the record's
// gate history.
const handlers: OutboxHandlers<ShipmentOutboxRecord> = {
  send: sendRow,
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
    const kept = keptDays.get(row);
    // A day kept wrote nothing: the row never counts as the gate's day later (sentReleasedDays).
    if (kept) await shipmentOutboxRepository.markDayKept(row.id, row.companyId);
    if (kept && was) {
      // The day set in Shipments stayed: the record says so, not that the gate's day was set.
      const plate = row.payload.plateNumber ? " (the plate was sent)" : "";
      await gateMovementRepository.appendEvents(row.movementId, row.companyId, [
        { ...releasedInShipmentsEvent(kept, new Date().toISOString(), "Shipments"), detail: `the gate's day ${row.payload.warehouseReleasedDate} is not sent over it${plate}` },
      ]);
    } else if (was === "pending") {
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
