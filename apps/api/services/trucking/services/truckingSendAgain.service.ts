import { APIError } from "encore.dev/api";
import { db } from "../db/db";
import { consignmentRepository } from "../repositories/consignment.repository";
import { legRepository } from "../repositories/leg.repository";
import { tripRepository } from "../repositories/trip.repository";
import { truckingOutboxRepository } from "../repositories/truckingOutbox.repository";
import { appendEvent } from "../repositories/event.repository";
import type { TruckingOutboxRecord } from "../schemas/truckingOutbox.schema";
import type { TruckingUnsentUpdate } from "../interfaces/outbox.interfaces";
import type { Actor } from "../../../lib/rbac";
import { isUuid } from "../../../lib/uuid";
import { sendFailedAgain } from "../../../lib/outbox/sendAgain";
import { isManager } from "../lib/roles";
import { userName } from "../lib/users";
import { deliverDue, OUTBOX_WHAT } from "./truckingOutbox.service";

// "Not sent — Send again": the job updates of a consignment (or of the consignments on a trip)
// that failed for good, and a manager's action that sends them again (logged in the history).
// Rows written by a user who has left go out as the service identity ("Trucking (system)").

/** A consignment, the consignments on a trip, or (neither) the whole company. */
export interface SendAgainAbout {
  consignmentId?: string;
  tripId?: string;
}

const MANAGERS_ONLY = "Only a manager can send failed updates again";

/** The consignments on a trip: an FTL trip's own, and those with a leg on it. */
async function consignmentsOfTrip(companyId: string, tripId: string): Promise<string[]> {
  if (!isUuid(tripId) || !(await tripRepository.find(companyId, tripId))) throw APIError.notFound("Trip not found");
  const [ftl, legs] = await Promise.all([consignmentRepository.findByTrips(companyId, [tripId]), legRepository.forTrips(companyId, [tripId])]);
  return [...new Set([...ftl.map((c) => c.id), ...legs.map((l) => l.consignmentId)])];
}

/** The consignments `about` names (undefined: the whole company). */
async function consignmentsOf(companyId: string, about: SendAgainAbout): Promise<string[] | undefined> {
  if (about.tripId) return consignmentsOfTrip(companyId, about.tripId);
  if (about.consignmentId) {
    if (!isUuid(about.consignmentId) || !(await consignmentRepository.find(companyId, about.consignmentId))) throw APIError.notFound("Consignment not found");
    return [about.consignmentId];
  }
  return undefined;
}

/** The rows as managers see them, with the consignment's ref and job number. */
export async function unsentItems(companyId: string, rows: TruckingOutboxRecord[]): Promise<TruckingUnsentUpdate[]> {
  const consignments = await consignmentRepository.findMany(companyId, [...new Set(rows.map((r) => r.consignmentId))]);
  const byId = new Map(consignments.map((c) => [c.id, c]));
  return rows.map((r) => ({
    id: r.id,
    consignmentId: r.consignmentId,
    consignmentRef: byId.get(r.consignmentId)?.ref ?? "",
    shipmentId: r.shipmentId,
    jobNumber: byId.get(r.consignmentId)?.jobNumber ?? "",
    what: OUTBOX_WHAT[r.kind] ?? r.kind,
    state: r.status === "failed" ? "failed" : "pending",
    attempts: r.attempts,
    lastError: r.lastError,
    since: r.createdAt.toISOString(),
  }));
}

/** Failed job updates of a consignment, of a trip's consignments, or of the whole company. Managers only. */
export async function failedUpdates(actor: Actor, about: SendAgainAbout): Promise<TruckingUnsentUpdate[]> {
  if (!isManager(actor.role)) throw APIError.permissionDenied(MANAGERS_ONLY);
  const ids = await consignmentsOf(actor.companyID, about);
  return unsentItems(actor.companyID, await truckingOutboxRepository.failedFor(actor.companyID, ids));
}

/**
 * Sends the failed updates of a consignment (or of a trip's consignments) again: back to pending
 * with a fresh count, an event on each consignment, then sent straight away. Managers only.
 * Returns what is still failed afterwards.
 */
export async function sendAgain(actor: Actor, about: SendAgainAbout): Promise<{ requeued: number; unsent: TruckingUnsentUpdate[] }> {
  if (!isManager(actor.role)) throw APIError.permissionDenied(MANAGERS_ONLY);
  const companyId = actor.companyID;
  const ids = await consignmentsOf(companyId, about);
  if (!ids) throw APIError.invalidArgument("Name the consignment or the trip");
  const failed = await truckingOutboxRepository.failedFor(companyId, ids);
  if (!failed.length) throw APIError.failedPrecondition("Nothing failed to send again");
  const requeued = await sendFailedAgain(truckingOutboxRepository, companyId, failed);
  const by = await userName(actor.userID);
  const tripId = about.tripId ?? null;
  for (const consignmentId of [...new Set(requeued.map((r) => r.consignmentId))]) {
    const what = [...new Set(requeued.filter((r) => r.consignmentId === consignmentId).map((r) => OUTBOX_WHAT[r.kind] ?? r.kind))];
    await appendEvent(db, companyId, {
      kind: "outbox_sent_again",
      consignmentId,
      tripId,
      byUserId: actor.userID,
      byName: by,
      payload: { changes: {}, summary: `Sent again: ${what.join(", ")}` },
    });
    await deliverDue(consignmentId);
  }
  const unsent = await unsentItems(companyId, await truckingOutboxRepository.failedFor(companyId, ids));
  return { requeued: requeued.length, unsent };
}
