import { APIError } from "encore.dev/api";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { shipmentOutboxRepository } from "../repositories/shipmentOutbox.repository";
import { gateEventOutboxRepository } from "../repositories/gateEventOutbox.repository";
import type { GateMovementItem } from "../interfaces/gate.interfaces";
import type { ShipmentOutboxRecord } from "../schemas/shipmentOutbox.schema";
import type { GateEventOutboxRecord } from "../schemas/gateEventOutbox.schema";
import { sendFailedAgain } from "../../../lib/outbox/sendAgain";
import { deliverDue, OUTBOX_WHAT } from "./shipmentOutbox.service";
import { deliverGateEvents, GATE_EVENT_WHAT } from "./gateEvents.service";
import { gateMovementService } from "./gateMovement.service";
import { isManager, userName } from "./users";

// "Not sent — Send again" on a gate record: the shipment updates (dates, plate) and the events for
// Trucking (gate-in, gate-out, voids) of the record that failed for good, and a manager's action
// that sends them again (logged in the record's history). A shipment update written by a user who
// has left goes out as the service identity ("Trucking (system)").

/** What a gate record failed to send for good. */
export interface GateUnsent {
  /** Shipment updates, in words (e.g. "warehouse received date") */
  shipmentUpdates: string[];
  /** Events for Trucking, in words (e.g. "gate-in") */
  gateEvents: string[];
  /** The latest error, in our own wording */
  lastError: string;
}

/** The history event of "Send again" (a shipment-update event, see the web's gate history). */
export const SENT_AGAIN_EVENT = "shipmentUpdateSentAgain";

const MANAGERS_ONLY = "Only a manager can send failed updates again";

async function failedOf(id: string, companyId: string) {
  const m = await gateMovementRepository.findByIdAny(id, companyId);
  if (!m) throw APIError.notFound("Gate movement not found");
  const [updates, events] = await Promise.all([shipmentOutboxRepository.failedForMovement(id, companyId), gateEventOutboxRepository.failedForMovement(id, companyId)]);
  return { updates, events };
}

/** The failed rows as shown; null when nothing failed. */
export function unsentState(
  updates: Pick<ShipmentOutboxRecord, "kind" | "lastError" | "updatedAt">[],
  events: Pick<GateEventOutboxRecord, "event" | "lastError" | "updatedAt">[],
): GateUnsent | null {
  if (!updates.length && !events.length) return null;
  const latest = [...updates, ...events].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]!;
  return {
    shipmentUpdates: [...new Set(updates.map((r) => OUTBOX_WHAT[r.kind] ?? r.kind))],
    gateEvents: [...new Set(events.map((r) => GATE_EVENT_WHAT[r.event.kind] ?? r.event.kind))],
    lastError: latest.lastError,
  };
}

/** What the record failed to send (managers only); null when nothing. */
export async function gateUnsent(id: string, companyId: string, role: string): Promise<GateUnsent | null> {
  if (!isManager(role)) throw APIError.permissionDenied(MANAGERS_ONLY);
  const { updates, events } = await failedOf(id, companyId);
  return unsentState(updates, events);
}

/**
 * Sends the record's failed shipment updates and gate events again: back to pending with a fresh
 * count, logged, then sent straight away. Managers only. Returns the record and what is still
 * failed afterwards.
 */
export async function gateSendAgain(id: string, companyId: string, userId: string, role: string): Promise<{ movement: GateMovementItem; unsent: GateUnsent | null }> {
  if (!isManager(role)) throw APIError.permissionDenied(MANAGERS_ONLY);
  const { updates, events } = await failedOf(id, companyId);
  if (!updates.length && !events.length) throw APIError.failedPrecondition("Nothing failed to send again");
  const what = unsentState(updates, events)!;
  const [requeued] = await Promise.all([
    sendFailedAgain(shipmentOutboxRepository, companyId, updates),
    // Events are published, not sent as a user: no identity to replace.
    gateEventOutboxRepository.requeueFailed(companyId, events.map((r) => r.id), null),
  ]);
  await gateMovementRepository.appendEvents(id, companyId, [
    { kind: SENT_AGAIN_EVENT, label: `Not sent — sent again: ${[...what.shipmentUpdates, ...what.gateEvents].join(", ")}`, at: new Date().toISOString(), by: await userName(userId) },
  ]);
  if (requeued.length) await deliverDue({ shipmentIds: [...new Set(requeued.map((r) => r.shipmentId))] });
  if (events.length) await deliverGateEvents(id);
  const after = await failedOf(id, companyId);
  return { movement: await gateMovementService.get(id, companyId), unsent: unsentState(after.updates, after.events) };
}
