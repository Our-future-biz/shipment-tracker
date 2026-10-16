import log from "encore.dev/log";
import { invoicing, shipments } from "~encore/clients";
import { truckingOutboxRepository } from "../repositories/truckingOutbox.repository";
import { appendEvent } from "../repositories/event.repository";
import type { TruckingOutboxKind, TruckingOutboxRecord } from "../schemas/truckingOutbox.schema";
import { parseOutboxRow } from "../lib/outboxPayload";
import { cancelExpected, expectArrival, expectDeparture } from "../lib/warehouseLink";
import { outboxErrorCode } from "../../../lib/outbox/outboxRetry";
import { deliverOutboxRow, runOutboxDelivery, type OutboxHandlers } from "../../../lib/outbox/outboxDelivery";
import { actingAuthNow, sendShipmentUpdateAs } from "../../../lib/outbox/shipmentUpdateAs";
import { db } from "../db/db";
import { recordSellingDifferences } from "./sellingDifference.service";

// Delivery of what consignments and trips owe their job: dates and plate (ShipmentUpdate), the
// Billing step (shipments), the Trucking lines of Costs Breakdown (invoicing) and an LTL trip's
// announcement to our warehouse (warehouse). Each row is sent as the user who caused it - what
// the system or a haulier caused, as the service identity "Trucking (system)"
// (lib/outbox/serviceIdentity). Rows are sent right after the change; what fails is retried by
// the trucking-shipment-outbox cron (and the local timer, see startOutboxTimer) with a growing
// wait. Only a pending row holds back the later rows of its job; one that failed for good is
// shown as needing attention and a manager can send it again (truckingSendAgain.service).
// The retry rules and the delivery loop are shared (lib/outbox).

const TICK_MS = 60_000;

export const OUTBOX_WHAT: Record<TruckingOutboxKind, string> = {
  planned: "pick-up and planned delivery date",
  plate: "plate number",
  delivered: "actual delivery date",
  billing: "Shipment Status Billing",
  costs: "Trucking lines in Costs Breakdown",
  expect_arrival: "expected arrival at our warehouse",
  expect_departure: "expected departure from our warehouse",
  cancel_expected: "trip withdrawn from our warehouse",
  real_costs: "real haulier cost in Costs Breakdown",
};

// What users see of a failed delivery (stored as last_error and in the history): our own
// wording by error code, never the upstream text, which is logged instead.
export function outboxErrorText(err: unknown): string {
  switch (outboxErrorCode(err)) {
    case "not_found":
      return "The job no longer exists in Shipments";
    case "permission_denied":
    case "unauthenticated":
      return "The user who made the change may no longer change this job";
    case "invalid_argument":
    case "failed_precondition":
      return "The update was refused";
    case "unavailable":
    case "deadline_exceeded":
      return "The other service did not answer";
    default:
      return "The update could not be sent";
  }
}

/** Sends one row to where it goes, as its acting user. */
export async function sendRow(row: TruckingOutboxRecord): Promise<void> {
  const message = parseOutboxRow(row);
  if (message.kind === "planned" || message.kind === "plate" || message.kind === "delivered") {
    await sendShipmentUpdateAs({ ...row, payload: message.payload });
    return;
  }
  const authData = await actingAuthNow(row);
  switch (message.kind) {
    // Our warehouse (lib/warehouseLink).
    case "expect_arrival":
      await expectArrival(message.payload, authData);
      return;
    case "expect_departure":
      await expectDeparture(message.payload, authData);
      return;
    case "cancel_expected":
      await cancelExpected(message.payload, authData);
      return;
    case "billing":
      await shipments._internalShipmentMarkBilling({ shipmentId: row.shipmentId }, { authData });
      return;
    case "real_costs":
      await invoicing._internalInvoicingTruckingReal({ shipmentId: row.shipmentId, ...message.payload }, { authData });
      return;
    case "costs": {
      const result = await invoicing._internalInvoicingTruckingLines({ shipmentId: row.shipmentId, ...message.payload }, { authData });
      // A selling set kept for an issued invoice: Invoicing added the difference as its own line (decision 9).
      await recordSellingDifferences(row, result?.differences);
      return;
    }
  }
}

const what = (row: Pick<TruckingOutboxRecord, "kind">) => OUTBOX_WHAT[row.kind] ?? row.kind;

const handlers: OutboxHandlers<TruckingOutboxRecord> = {
  send: sendRow,
  errorText: outboxErrorText,
  async onFailed(row, error, err) {
    await truckingOutboxRepository.markFailed(row.id, row.attempts, error);
    await appendEvent(db, row.companyId, {
      kind: row.kind === "costs" || row.kind === "real_costs" ? "costs_update_failed" : "shipment_update_failed",
      consignmentId: row.consignmentId,
      byUserId: null,
      byName: "Trucking",
      payload: { changes: {}, summary: `Not updated: ${what(row)} — ${error}` },
    });
    log.error(err, "trucking: update of a job failed for good", { outboxId: row.id, consignmentId: row.consignmentId, shipmentId: row.shipmentId, error });
  },
  async onRetry(row, error, nextAttemptAt, err) {
    await truckingOutboxRepository.markRetry(row.id, row.attempts, error, nextAttemptAt);
    log.warn("trucking: update of a job will be retried", {
      outboxId: row.id,
      consignmentId: row.consignmentId,
      attempts: row.attempts,
      error: err instanceof Error ? err.message : String(err),
    });
  },
  async onSent(row) {
    await truckingOutboxRepository.markSent(row.id, row.attempts);
  },
};

/** Sends what is due, oldest first (one job's updates in order); with a consignment, only its rows. Never throws. */
export async function deliverDue(consignmentId?: string): Promise<{ sent: number; retry: number; failed: number }> {
  return runOutboxDelivery({
    claim: (limit) => truckingOutboxRepository.claimDue(limit, consignmentId),
    deliver: (row) => deliverOutboxRow(row, handlers),
    onError: (err) => log.error(err, "trucking: outbox delivery run failed"),
  });
}

/** A pending update older than this is reported as a warning (and as needing attention). */
export const STALE_PENDING_MINUTES = 10;

/**
 * Logs a warning when updates failed for good or wait longer than STALE_PENDING_MINUTES (the
 * consignments show it as needing attention, see unsentReasons). Returns how many. Never throws.
 */
export async function warnStaleOutbox(): Promise<number> {
  try {
    const { failed, stalePending, oldestPending } = await truckingOutboxRepository.unsentHealth(STALE_PENDING_MINUTES);
    if (failed) log.warn("trucking: updates of jobs failed for good and wait for a manager to send them again", { failed });
    if (stalePending) log.warn("trucking: updates of jobs are waiting longer than expected", { count: stalePending, oldest: oldestPending, minutes: STALE_PENDING_MINUTES });
    return failed + stalePending;
  } catch (err) {
    log.error(err, "trucking: outbox health check failed");
    return 0;
  }
}

/** The Needs-attention reason of each consignment whose job updates failed or wait too long. */
export function unsentReasonsOf(rows: Pick<TruckingOutboxRecord, "consignmentId" | "kind" | "status">[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const id of new Set(rows.map((r) => r.consignmentId))) {
    const mine = rows.filter((r) => r.consignmentId === id);
    const failed = mine.filter((r) => r.status === "failed");
    const shown = failed.length ? failed : mine;
    const whats = [...new Set(shown.map(what))].join(", ");
    out.set(id, failed.length ? `Not sent to the job: ${whats} — a manager can send it again` : `Not sent to the job yet: ${whats} (retrying)`);
  }
  return out;
}

/** Adds "Not sent to the job" to the Needs-attention reasons of the consignments listed. */
export async function addUnsentReasons<T extends { id: string; needsAttention: string[] }>(companyId: string, items: T[]): Promise<T[]> {
  const reasons = unsentReasonsOf(await truckingOutboxRepository.unsentFor(companyId, items.map((i) => i.id), STALE_PENDING_MINUTES));
  return reasons.size ? items.map((i) => (reasons.has(i.id) ? { ...i, needsAttention: [...i.needsAttention, reasons.get(i.id)!] } : i)) : items;
}

let started = false;

// Encore cron jobs do not fire under `encore run`, so a minute timer does the same job locally.
// In the cloud both run; claiming rows with SKIP LOCKED keeps them apart.
export function startOutboxTimer(): void {
  if (started || process.env.VITEST) return;
  started = true;
  setInterval(() => void deliverDue().then(() => warnStaleOutbox()), TICK_MS).unref();
}
