import { APIError } from "encore.dev/api";
import type { Actor } from "../../../lib/rbac";
import { iso } from "../../../lib/db/serialize";
import { isUuid } from "../../../lib/uuid";
import type { ReleaseRequestItem } from "../interfaces/interfaces";
import {
  MAX_RELEASE_TEXT,
  MIN_RELEASE_REASON,
  ONLY_MANAGERS_DECIDE,
  RELEASE_KIND,
  RELEASE_REQUEST_FIELD,
  RELEASE_WHATS,
  WITHDRAW_NOT_YOURS,
  WITHDRAW_ONLY_MANAGERS,
  alreadyApproved,
  answeredLine,
  askedLine,
  canDecideRelease,
  decideRefusal,
  isReleaseWhat,
  isUsable,
  nothingToRelease,
  passDecidedSince,
  validUntil,
  withdrawOf,
  withdrawnLine,
} from "../lib/releaseRequest";
import { DETAILS_REFUSAL } from "../lib/shipmentEditRule";
import { userNameOf } from "../lib/userName";
import { shipmentReleaseRequestRepository as requests, type ReleaseRequestRow } from "../repositories/shipmentReleaseRequest.repository";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentService } from "./shipment.service";

const HISTORY_DAYS = 30;
const SEEN_KEEP_DAYS = 7;
const LIST_LIMIT = 200;
const DAY_MS = 86_400_000;

const toItem = (r: ReleaseRequestRow, now: Date): ReleaseRequestItem => {
  const until = validUntil(r);
  return {
    id: r.id,
    shipmentId: r.shipmentId,
    jobNumber: r.jobNumber ?? "",
    customer: r.customer,
    what: r.what,
    reason: r.reason,
    status: r.status,
    requestedById: r.requestedById,
    requestedByName: r.requestedByName,
    requestedAt: iso(r.requestedAt),
    decidedByName: r.decidedByName,
    decidedAt: r.decidedAt ? iso(r.decidedAt) : null,
    comment: r.comment,
    answerSeenAt: r.answerSeenAt ? iso(r.answerSeenAt) : null,
    usedAt: r.usedAt ? iso(r.usedAt) : null,
    usedByName: r.usedByName,
    validUntil: until ? iso(until) : null,
    usable: isUsable(r, now),
    // Closed by a release made another way, or withdrawn: dated by its closing (an old row by the write that closed it).
    closedAt: r.status === "closed" ? iso(r.closedAt ?? r.updatedAt) : null,
    // A row closed before its closing had fields of its own (migration 0089 gave them "released") was closed by a release.
    closedWhy: r.status === "closed" ? (r.closedWhy ?? "released") : null,
    closedByName: r.status === "closed" ? r.closedByName : "",
    closeReason: r.status === "closed" ? r.closeReason : "",
  };
};

// "Ask a manager to release" (lib/releaseRequest), built as the Customs Office request is
// (customsOfficeRequest.service): a user asks, a manager answers, the one who asked hears of it under the bell.
// Nothing is released here: an approved request is used by the release itself (shipment.service's release paths).
class ReleaseRequestService {
  /**
   * Whoever may make the release asks for it: the House BoL by the job's Handled By or Holiday Cover (or anyone
   * while nobody is named) - the release endpoint's own rule; Warehouse Released by anyone of the company, as the
   * field is the warehouse's (lib/shipmentEditRule). Only for a release the prepayment stop refuses a user right
   * now: a job it does not hold is released without a manager. Not while a request waits, nor while an approved
   * one can still be used - then the release is to be made, not asked for again.
   */
  async ask(actor: Actor, shipmentId: string, input: { what: string; reason: string }, now = new Date()): Promise<ReleaseRequestItem> {
    const reason = (input.reason ?? "").trim();
    if (!isReleaseWhat(input.what)) throw APIError.invalidArgument(`what must be one of ${RELEASE_WHATS.join(", ")}`);
    if (reason.length < MIN_RELEASE_REASON) throw APIError.invalidArgument("Say why the job should be released before it is paid");
    if (reason.length > MAX_RELEASE_TEXT) throw APIError.invalidArgument(`The reason is too long (at most ${MAX_RELEASE_TEXT} characters)`);
    const what = input.what;
    const shipment = isUuid(shipmentId) ? await shipmentRepository.getByIdForCompany(shipmentId, actor.companyID) : null;
    if (!shipment) throw APIError.notFound("Shipment not found");
    if (what === "house_bol" && !(await shipmentService.mayChangeDetails(shipment, actor.userID, actor.role))) throw APIError.permissionDenied(DETAILS_REFUSAL);
    const nothing = nothingToRelease(shipment, what);
    if (nothing) throw APIError.failedPrecondition(nothing);
    const pass = await requests.usablePass(actor.companyID, shipmentId, what, passDecidedSince(now));
    if (pass) throw APIError.failedPrecondition(alreadyApproved(validUntil(pass)!));
    if (!(await shipmentService.prepaymentRefusal(shipmentId, RELEASE_KIND[what]))) {
      throw APIError.failedPrecondition("This job is not held for payment: it can be released without a manager");
    }

    const created = await requests.create(
      { companyId: actor.companyID, shipmentId, what, reason, requestedById: actor.userID, requestedByName: await userNameOf(actor.userID) },
      { userId: actor.userID, field: RELEASE_REQUEST_FIELD, oldValue: null, newValue: askedLine(what, reason) },
    );
    if (!created) throw APIError.alreadyExists("A request for this release is already waiting for a manager");
    return toItem({ ...created, jobNumber: shipment.jobNumber, customer: shipment.customer }, now);
  }

  /** The shipment's newest request of each thing asked, for the place the release is made from. */
  async latest(actor: Actor, shipmentId: string, now = new Date()): Promise<ReleaseRequestItem[]> {
    if (!isUuid(shipmentId)) return [];
    return (await requests.latestForShipment(shipmentId, actor.companyID)).map((r) => toItem(r, now));
  }

  /**
   * A manager: everything waiting, and what was answered - or closed by a release made another way - in the
   * last 30 days (the Approvals tab). Anyone else: their own, the same way.
   */
  async list(actor: Actor, now = new Date()): Promise<ReleaseRequestItem[]> {
    const since = new Date(now.getTime() - HISTORY_DAYS * DAY_MS);
    const rows = canDecideRelease(actor.role)
      ? await requests.listForManagers(actor.companyID, since, LIST_LIMIT)
      : await requests.listForUser(actor.companyID, actor.userID, since, LIST_LIMIT);
    return rows.map((r) => toItem(r, now));
  }

  /**
   * A manager answers - never the one who asked - with a reason either way: a direct override needs one too.
   * Rejected, that is all. Approved, that is all as well: NOTHING is released here. The approved request is a
   * pass (lib/releaseRequest) the release itself uses, in its own write turn, when whoever on the job makes it.
   * A request whose release is made already, or can't be made (the cargo never received), is not approved: the
   * manager is told to reject it. The answer and its line in the job's history are written together, once.
   */
  async decide(actor: Actor, id: string, input: { approve: boolean; comment?: string }, now = new Date()): Promise<ReleaseRequestItem> {
    if (!canDecideRelease(actor.role)) throw APIError.permissionDenied(ONLY_MANAGERS_DECIDE);
    const comment = (input.comment ?? "").trim();
    if (comment.length > MAX_RELEASE_TEXT) throw APIError.invalidArgument(`The comment is too long (at most ${MAX_RELEASE_TEXT} characters)`);
    if (comment.length < MIN_RELEASE_REASON) {
      throw APIError.invalidArgument(input.approve ? "Say why the job may be released before it is paid" : "Say why the request is rejected");
    }

    const request = isUuid(id) ? await requests.get(id, actor.companyID) : null;
    if (!request) throw APIError.notFound("Request not found");
    const refusal = decideRefusal(request, actor);
    if (refusal) throw APIError.permissionDenied(refusal);
    if (request.status !== "pending") throw APIError.failedPrecondition("This request has already been answered");
    if (input.approve) {
      const shipment = await shipmentRepository.getByIdForCompany(request.shipmentId, actor.companyID);
      if (!shipment) throw APIError.notFound("Shipment not found");
      const nothing = nothingToRelease(shipment, request.what);
      if (nothing) throw APIError.failedPrecondition(`${nothing}: reject the request instead`);
    }

    const answered = await requests.answer(
      id,
      actor.companyID,
      { status: input.approve ? "approved" : "rejected", decidedById: actor.userID, decidedByName: await userNameOf(actor.userID), decidedAt: now, comment },
      { userId: actor.userID, field: RELEASE_REQUEST_FIELD, oldValue: null, newValue: answeredLine(request, input.approve, comment) },
    );
    if (!answered) throw APIError.failedPrecondition("This request has already been answered");
    return toItem({ ...answered, jobNumber: request.jobNumber, customer: request.customer }, now);
  }

  /**
   * Withdraws a request (K20; lib/releaseRequest withdrawOf), with a reason and a line in the job's history:
   * whoever asked their request still waiting, a manager an approval nobody has used yet - it then lets nothing
   * through any more. Closed as withdrawn, with who and why. Written once: withdrawn, answered or used meanwhile,
   * it is refused and nothing is written.
   */
  async withdraw(actor: Actor, id: string, input: { reason: string }, now = new Date()): Promise<ReleaseRequestItem> {
    const reason = (input.reason ?? "").trim();
    if (reason.length < MIN_RELEASE_REASON) throw APIError.invalidArgument("Say why it is withdrawn");
    if (reason.length > MAX_RELEASE_TEXT) throw APIError.invalidArgument(`The reason is too long (at most ${MAX_RELEASE_TEXT} characters)`);
    const request = isUuid(id) ? await requests.get(id, actor.companyID) : null;
    if (!request) throw APIError.notFound("Request not found");
    const what = withdrawOf(request, actor);
    // Not theirs to withdraw is a refusal of the person; used or done already, of the request.
    if ("refusal" in what) throw what.refusal === WITHDRAW_NOT_YOURS || what.refusal === WITHDRAW_ONLY_MANAGERS ? APIError.permissionDenied(what.refusal) : APIError.failedPrecondition(what.refusal);
    const withdrawn = await requests.withdraw(
      id,
      actor.companyID,
      what.kind,
      { id: actor.userID, name: await userNameOf(actor.userID), reason, at: now },
      { userId: actor.userID, field: RELEASE_REQUEST_FIELD, oldValue: null, newValue: withdrawnLine(request, what.kind, reason) },
    );
    if (!withdrawn) throw APIError.failedPrecondition("This request was answered, used or closed meanwhile: nothing was withdrawn");
    return toItem({ ...withdrawn, jobNumber: request.jobNumber, customer: request.customer }, now);
  }

  /**
   * The bell: a manager's answers to the user's own requests - approved (with whether it can still be used) and
   * rejected - not opened yet or opened in the last 7 days. A closed request is no answer.
   */
  async myAnswers(actor: Actor, now = new Date()): Promise<ReleaseRequestItem[]> {
    const seenSince = new Date(now.getTime() - SEEN_KEEP_DAYS * DAY_MS);
    return (await requests.answersFor(actor.companyID, actor.userID, seenSince, LIST_LIMIT)).map((r) => toItem(r, now));
  }

  async markSeen(actor: Actor, id: string): Promise<void> {
    if (isUuid(id)) await requests.markSeen(id, actor.companyID, actor.userID, new Date());
  }
}

export const releaseRequestService = new ReleaseRequestService();
