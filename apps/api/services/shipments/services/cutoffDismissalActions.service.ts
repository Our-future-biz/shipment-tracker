import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import type { Actor } from "../../../lib/rbac";
import { iso } from "../../../lib/db/serialize";
import { isUuid } from "../../../lib/uuid";
import type { CutoffDismissalItem } from "../interfaces/interfaces";
import { CUTOFF_DISMISSED_FIELD, CUTOFF_KEYS, dismissable, dismissedLine, isCutoffKey, takenBackLine } from "../lib/cutoffDismissals";
import { cargoIn, cutoffsOf, opsDay, timelineFactsOf, type TimelineFacts } from "../lib/managersCockpit";
import { CARGO_IN_EVENT_KINDS } from "../lib/needsAttention";
import { userNameOf } from "../lib/userName";
import { shipmentCutoffDismissalRepository as dismissals } from "../repositories/shipmentCutoffDismissal.repository";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentTrackingEventRepository } from "../repositories/shipmentTrackingEvent.repository";
import type { ShipmentCutoffDismissalRecord } from "../schemas/shipmentCutoffDismissal.schema";

const MIN_REASON = 3;
const MAX_REASON = 500;

const toItem = (r: ShipmentCutoffDismissalRecord): CutoffDismissalItem => ({
  id: r.id,
  shipmentId: r.shipmentId,
  cutoff: r.cutoff,
  cutoffDate: r.cutoffDate,
  reason: r.reason,
  dismissedByName: r.dismissedByName,
  dismissedAt: iso(r.createdAt),
});

// Dismissing a missed cut-off, and taking that back (the read both pages share is
// services/cutoffDismissal.service). Managers only: the endpoints check the role (requireRole) and hand the
// manager over as `actor`.
class CutoffDismissalActionsService {
  /** A job's live dismissals, for the dialog that takes one back. */
  async list(actor: Actor, shipmentId: string): Promise<CutoffDismissalItem[]> {
    if (!isUuid(shipmentId) || !(await shipmentRepository.getByIdForCompany(shipmentId, actor.companyID))) throw APIError.notFound("Shipment not found");
    return (await dismissals.listForShipment(shipmentId, actor.companyID)).map(toItem);
  }

  /**
   * Dismisses a cut-off the shared rule calls missed or overdue right now (lib/managersCockpit
   * cutoffsOf, on this instant), for the date it has: stored with the reason and a line in the job's
   * history. Dismissed already (a second click) answers the dismissal that stands, and writes nothing.
   */
  async dismiss(actor: Actor, shipmentId: string, input: { cutoff: string; reason: string }, now = new Date()): Promise<CutoffDismissalItem> {
    const reason = (input.reason ?? "").trim();
    if (!isCutoffKey(input.cutoff)) throw APIError.invalidArgument(`cutoff must be one of ${CUTOFF_KEYS.join(", ")}`);
    if (reason.length < MIN_REASON) throw APIError.invalidArgument("Say why the missed cut-off is dismissed");
    if (reason.length > MAX_REASON) throw APIError.invalidArgument(`The reason is too long (at most ${MAX_REASON} characters)`);
    const cutoff = input.cutoff;
    const job = isUuid(shipmentId) ? await shipmentRepository.getByIdForCompany(shipmentId, actor.companyID) : null;
    if (!job) throw APIError.notFound("Shipment not found");

    // Whether a cut-off is missed hangs on today and the time alone - no working day is counted -
    // so the company's holidays need not be read. A Closing also on whether the cargo is in.
    // (Received at our warehouse says so on its own: then the timeline is not read.)
    const cargoIsIn = cutoff === "closingDate" ? (cargoIn(job, null) ?? cargoIn(job, await this.timelineOf(shipmentId, actor.companyID))) : false;
    if (cutoff === "closingDate" && cargoIsIn === null) {
      throw APIError.unavailable("Whether the cargo made its Closing could not be read just now: try again in a moment");
    }
    const verdict = dismissable(cutoffsOf(job, opsDay(now), cargoIsIn), cutoff);
    if ("refusal" in verdict) throw APIError.failedPrecondition(verdict.refusal);

    const created = await dismissals.createWithHistory(
      { companyId: actor.companyID, shipmentId, cutoff, cutoffDate: verdict.date, reason, dismissedById: actor.userID, dismissedByName: await userNameOf(actor.userID) },
      { userId: actor.userID, field: CUTOFF_DISMISSED_FIELD, oldValue: null, newValue: dismissedLine(cutoff, verdict.date, reason) },
    );
    if (created) return toItem(created);
    const standing = await dismissals.findLive(actor.companyID, shipmentId, cutoff, verdict.date);
    // Taken back between the two reads: asked again, it is dismissed anew.
    if (!standing) throw APIError.aborted("This cut-off's dismissal was changed meanwhile: try again");
    return toItem(standing);
  }

  /** Takes a dismissal back: the cut-off counts again on both pages. One already taken back is fine. */
  async takeBack(actor: Actor, shipmentId: string, id: string): Promise<void> {
    if (!isUuid(shipmentId) || !isUuid(id)) throw APIError.notFound("Dismissal not found");
    await dismissals.takeBack(id, shipmentId, actor.companyID, (row) => ({
      userId: actor.userID,
      field: CUTOFF_DISMISSED_FIELD,
      oldValue: dismissedLine(row.cutoff, row.cutoffDate, row.reason),
      newValue: takenBackLine(row.cutoff, row.cutoffDate),
    }));
  }

  // What the job's timeline says about the cargo being in; null when it could not be read.
  private async timelineOf(shipmentId: string, companyId: string): Promise<TimelineFacts | null> {
    try {
      return timelineFactsOf(await shipmentTrackingEventRepository.factsOfKinds([shipmentId], companyId, CARGO_IN_EVENT_KINDS));
    } catch (err) {
      log.warn(err, "cut-off dismissal: the job's tracking events could not be read", { shipmentId });
      return null;
    }
  }
}

export const cutoffDismissalActionsService = new CutoffDismissalActionsService();
