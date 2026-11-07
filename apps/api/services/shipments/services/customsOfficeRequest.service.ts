import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { auth } from "~encore/clients";
import type { Actor } from "../../../lib/rbac";
import { iso } from "../../../lib/db/serialize";
import { isUuid } from "../../../lib/uuid";
import type { CustomsOfficeRequestItem } from "../interfaces/interfaces";
import { canChangeCustomsOffice, isListedCustomsOffice } from "../lib/customsOffice";
import { customsOfficeRequestRepository as requests, type CustomsOfficeRequestRow } from "../repositories/customsOfficeRequest.repository";
import { shipmentRepository } from "../repositories/shipment.repository";
import { commentService } from "./comment.service";
import { shipmentService } from "./shipment.service";

const MAX_TEXT = 1000;
const MIN_REASON = 3;
const HISTORY_DAYS = 30;
const SEEN_KEEP_DAYS = 7;
const LIST_LIMIT = 200;
const DAY_MS = 86_400_000;


const toItem = (r: CustomsOfficeRequestRow): CustomsOfficeRequestItem => ({
  id: r.id,
  shipmentId: r.shipmentId,
  jobNumber: r.jobNumber ?? "",
  customer: r.customer,
  fromOffice: r.fromOffice,
  toOffice: r.toOffice,
  reason: r.reason,
  status: r.status,
  requestedById: r.requestedById,
  requestedByName: r.requestedByName,
  requestedAt: iso(r.requestedAt),
  decidedByName: r.decidedByName,
  decidedAt: r.decidedAt ? iso(r.decidedAt) : null,
  comment: r.comment,
  answerSeenAt: r.answerSeenAt ? iso(r.answerSeenAt) : null,
});

// The name a request keeps of who asked or answered; a failed look-up doesn't stop the request.
async function nameOf(userId: string): Promise<string> {
  try {
    const { users } = await auth.userLookup({ ids: [userId] });
    return users[0]?.name ?? "";
  } catch (err) {
    log.warn(err, "customs office request: user not resolved", { userId });
    return "";
  }
}

const isT1 = (procedure: string) => procedure.trim().toUpperCase() === "T1";

class CustomsOfficeRequestService {
  /** Anyone of the company asks: the request goes to the managers. */
  async ask(actor: Actor, shipmentId: string, input: { toOffice: string; reason: string }): Promise<CustomsOfficeRequestItem> {
    const toOffice = input.toOffice.trim();
    const reason = input.reason.trim();
    if (!isListedCustomsOffice(toOffice)) throw APIError.invalidArgument("Choose the new Customs Office from the list");
    if (reason.length < MIN_REASON) throw APIError.invalidArgument("Say why the Customs Office has to change");
    if (reason.length > MAX_TEXT) throw APIError.invalidArgument(`The reason is too long (at most ${MAX_TEXT} characters)`);
    const shipment = isUuid(shipmentId) ? await shipmentRepository.getByIdForCompany(shipmentId, actor.companyID) : null;
    if (!shipment) throw APIError.notFound("Shipment not found");
    if (!isT1(shipment.customsProcedure) || !shipment.customsOffice) {
      throw APIError.failedPrecondition("Only a T1 shipment with its Customs Office chosen needs a request");
    }
    if (toOffice === shipment.customsOffice) throw APIError.invalidArgument("That is already the shipment's Customs Office");

    const created = await requests.create({
      companyId: actor.companyID,
      shipmentId,
      fromOffice: shipment.customsOffice,
      toOffice,
      reason,
      requestedById: actor.userID,
      requestedByName: await nameOf(actor.userID),
    });
    if (!created) throw APIError.alreadyExists("A request to change this Customs Office is already waiting");
    // The shipment's chat and the managers' notifications are told. The request itself is what
    // counts, and it is on the Approvals tab either way, so a message that can't be posted doesn't undo it.
    try {
      await commentService.postCustomsOfficeRequestNotice(shipmentId, actor.companyID, actor.userID, created);
    } catch (err) {
      log.warn(err, "customs office request: the message to the shipment's chat could not be posted", { shipmentId });
    }
    return toItem({ ...created, jobNumber: shipment.jobNumber, customer: shipment.customer });
  }

  /** The shipment's newest request, for its Customs Office row. */
  async latest(actor: Actor, shipmentId: string): Promise<CustomsOfficeRequestItem | null> {
    if (!isUuid(shipmentId)) return null;
    const row = await requests.latestForShipment(shipmentId, actor.companyID);
    return row ? toItem(row) : null;
  }

  /** The Approvals tab: what waits, and what was answered in the last 30 days. */
  async listForManagers(actor: Actor): Promise<CustomsOfficeRequestItem[]> {
    if (!canChangeCustomsOffice(actor.role)) throw APIError.permissionDenied("Only a manager answers these requests");
    const since = new Date(Date.now() - HISTORY_DAYS * DAY_MS);
    return (await requests.listForManagers(actor.companyID, since, LIST_LIMIT)).map(toItem);
  }

  /**
   * A manager answers. Approved, the new office goes on the shipment (with its history entry), but
   * only while the shipment still is what was asked about; rejected, a reason is required.
   * The answer is taken first, so two managers can't both answer, and given back if the office
   * could not be written.
   */
  async decide(actor: Actor, id: string, input: { approve: boolean; comment?: string }): Promise<CustomsOfficeRequestItem> {
    if (!canChangeCustomsOffice(actor.role)) throw APIError.permissionDenied("Only a manager answers these requests");
    const comment = (input.comment ?? "").trim();
    if (comment.length > MAX_TEXT) throw APIError.invalidArgument(`The comment is too long (at most ${MAX_TEXT} characters)`);
    if (!input.approve && comment.length < MIN_REASON) throw APIError.invalidArgument("Say why the request is rejected");

    const request = isUuid(id) ? await requests.get(id, actor.companyID) : null;
    if (!request) throw APIError.notFound("Request not found");
    if (request.status !== "pending") throw APIError.failedPrecondition("This request has already been answered");
    if (input.approve) {
      const shipment = await shipmentRepository.getByIdForCompany(request.shipmentId, actor.companyID);
      if (!shipment) throw APIError.notFound("Shipment not found");
      if (!isT1(shipment.customsProcedure) || shipment.customsOffice !== request.fromOffice) {
        throw APIError.failedPrecondition("The shipment's Customs Office or procedure has changed since this was asked: reject the request instead");
      }
      // asked before the office left the list
      if (!isListedCustomsOffice(request.toOffice)) throw APIError.failedPrecondition("That office is no longer on the list: reject the request instead");
    }

    const answered = await requests.answer(id, actor.companyID, {
      status: input.approve ? "approved" : "rejected",
      decidedById: actor.userID,
      decidedByName: await nameOf(actor.userID),
      decidedAt: new Date(),
      comment,
    });
    if (!answered) throw APIError.failedPrecondition("This request has already been answered");

    if (input.approve) {
      try {
        await shipmentService.update(request.shipmentId, actor.companyID, { customsOffice: request.toOffice }, actor.userID);
      } catch (err) {
        await requests.reopen(id, actor.companyID);
        throw err;
      }
    }
    return toItem({ ...answered, jobNumber: request.jobNumber, customer: request.customer });
  }

  /** The bell: answers to the user's own requests, not opened yet or opened in the last 7 days. */
  async myAnswers(actor: Actor): Promise<CustomsOfficeRequestItem[]> {
    const seenSince = new Date(Date.now() - SEEN_KEEP_DAYS * DAY_MS);
    return (await requests.answersFor(actor.companyID, actor.userID, seenSince, LIST_LIMIT)).map(toItem);
  }

  async markSeen(actor: Actor, id: string): Promise<void> {
    if (isUuid(id)) await requests.markSeen(id, actor.companyID, actor.userID, new Date());
  }
}

export const customsOfficeRequestService = new CustomsOfficeRequestService();
