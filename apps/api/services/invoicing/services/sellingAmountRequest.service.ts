import { APIError } from "encore.dev/api";
import { userEmailOf } from "../../../lib/companyUsers";
import type { Actor } from "../../../lib/rbac";
import { canDecideQuoteInquiry } from "../../../lib/salesPolicy";
import { assertShipmentExists } from "../../../lib/shipmentRefs";
import { isUuid } from "../../../lib/uuid";
import { toDecimal } from "../lib/amounts";
import { answerProblem } from "../lib/sellingAmount";
import { sellingAmountRequestRepository as requests } from "../repositories/sellingAmountRequest.repository";
import { assertNotBilled } from "../lib/billedLock";
import type { SellingAmountRequestRecord } from "../schemas/sellingAmountRequest.schema";
import type { SellingAmountChangeResult, SellingAmountRequestItem } from "../interfaces/interfaces";

// The number of a selling row a shipment sells on at cost (a master job's demurrage). The same as
// the cost or more is written at once. Less takes a reason and a manager's approval, asked on
// Sales → Managers → Quote inquiries: the row stays as it is until a manager approves.

const ANSWERED_DAYS = 30;
const LIST_LIMIT = 300;
const BELL_LIMIT = 100;
/** How long the bell keeps an answer after it was opened. */
const SEEN_KEEP_DAYS = 7;
const DAY = 86_400_000;
const INVOICED = "This selling row is on an issued invoice — credit the invoice to change it";
const notFound = () => APIError.notFound("Selling cost not found");

const toItem = (r: SellingAmountRequestRecord): SellingAmountRequestItem => ({
  id: r.id,
  shipmentId: r.shipmentId,
  jobNumber: r.jobNumber,
  sellingCostId: r.sellingCostId,
  kind: r.kind,
  category: r.category,
  currency: r.currency,
  costAmount: r.costAmount,
  currentAmount: r.currentAmount,
  requestedAmount: r.requestedAmount,
  reason: r.reason,
  status: r.status,
  requestedById: r.requestedById,
  requestedByName: r.requestedByName,
  requestedAt: r.requestedAt.toISOString(),
  decidedByName: r.decidedByName,
  decidedAt: r.decidedAt?.toISOString() ?? null,
  comment: r.comment,
  selfDecision: r.selfDecision,
  answerSeenAt: r.answerSeenAt?.toISOString() ?? null,
});

class SellingAmountRequestService {
  async change(actor: Actor, shipmentId: string, sellingId: string, input: { amount: string; reason?: string }): Promise<SellingAmountChangeResult> {
    if (!isUuid(shipmentId) || !isUuid(sellingId)) throw notFound();
    await assertNotBilled(shipmentId, actor.companyID);
    const amount = toDecimal(input.amount, "amount");
    if (amount == null) throw APIError.invalidArgument("Enter an amount");
    if (Number(amount) < 0) throw APIError.invalidArgument("The amount can't be below zero");
    const reason = (input.reason ?? "").trim();
    if (reason && reason.length < 3) throw APIError.invalidArgument("Say why the amount is lower");
    const [job, userEmail] = await Promise.all([assertShipmentExists(shipmentId), userEmailOf(actor.userID)]);
    const result = await requests.change(actor.companyID, shipmentId, sellingId, { amount, reason, userId: actor.userID, userEmail, jobNumber: job.jobNumber });
    switch (result.outcome) {
      case "not_found":
        throw notFound();
      case "invoiced":
        throw APIError.failedPrecondition(INVOICED);
      case "no_cost":
        throw APIError.failedPrecondition("This row's share is no longer on the shipment: process the master job's split");
      case "reason_needed":
        throw APIError.invalidArgument("Selling for less than the cost needs a reason");
      case "already_waiting":
        throw APIError.failedPrecondition("A request for this row is already waiting for a manager: take it back to ask again");
      case "saved":
        return { outcome: "saved", request: null };
      case "asked":
        return { outcome: "asked", request: toItem(result.request) };
    }
  }

  /** Asks a manager to take the row off the shipment's selling: it stays until a manager approves. */
  async askRemoval(actor: Actor, shipmentId: string, sellingId: string, input: { reason: string }): Promise<SellingAmountRequestItem> {
    if (!isUuid(shipmentId) || !isUuid(sellingId)) throw notFound();
    await assertNotBilled(shipmentId, actor.companyID);
    const reason = (input.reason ?? "").trim();
    if (reason.length < 3) throw APIError.invalidArgument("Say why the row should go");
    const [job, userEmail] = await Promise.all([assertShipmentExists(shipmentId), userEmailOf(actor.userID)]);
    const result = await requests.askRemoval(actor.companyID, shipmentId, sellingId, { reason, userId: actor.userID, userEmail, jobNumber: job.jobNumber });
    switch (result.outcome) {
      case "asked":
        return toItem(result.request);
      case "invoiced":
        throw APIError.failedPrecondition(INVOICED);
      case "no_cost":
        throw APIError.failedPrecondition("This row's share is no longer on the shipment: process the master job's split");
      case "already_waiting":
        throw APIError.failedPrecondition("A request for this row is already waiting for a manager: take it back to ask again");
      default:
        throw notFound();
    }
  }

  async answer(actor: Actor, id: string, input: { decision: string; comment?: string }): Promise<SellingAmountRequestItem> {
    if (!canDecideQuoteInquiry(actor.role)) throw APIError.permissionDenied("Only a manager answers this");
    if (!isUuid(id)) throw APIError.notFound("This request is not there");
    const comment = (input.comment ?? "").trim();
    const problem = answerProblem(input.decision, comment);
    if (problem) throw APIError.invalidArgument(problem);
    if (input.decision === "approve") {
      const asked = await requests.byId(actor.companyID, id);
      if (asked) await assertNotBilled(asked.shipmentId, actor.companyID);
    }
    const userEmail = await userEmailOf(actor.userID);
    const result = await requests.answer(actor.companyID, id, { approve: input.decision === "approve", comment, userId: actor.userID, userEmail });
    switch (result.outcome) {
      case "not_found":
        throw APIError.notFound("This request is not there");
      case "answered_already":
        throw APIError.failedPrecondition(`This request was already ${result.request.status}${result.request.decidedByName ? ` by ${result.request.decidedByName}` : ""}`);
      case "invoiced":
        throw APIError.failedPrecondition(`${INVOICED}, or reject the request`);
      case "row_gone":
        throw APIError.failedPrecondition("This selling row is no longer on the shipment: reject the request");
      case "cost_changed":
        throw APIError.failedPrecondition(`The cost has changed to ${result.cost} since this was asked: reject it, and the rep can ask again`);
      case "done":
        return toItem(result.request);
    }
  }

  /**
   * The one who asked takes a waiting request back. A manager answers it instead: a rejection
   * carries its reason and reaches the one who asked, a withdrawal would do neither.
   */
  async withdraw(actor: Actor, id: string): Promise<SellingAmountRequestItem> {
    if (!isUuid(id)) throw APIError.notFound("This request is not there");
    const row = await requests.byId(actor.companyID, id);
    if (!row) throw APIError.notFound("This request is not there");
    if (row.requestedById !== actor.userID) throw APIError.permissionDenied("Only the one who asked can take it back — a manager rejects it, with a reason");
    const done = await requests.withdraw(actor.companyID, id, { id: actor.userID, name: await userEmailOf(actor.userID) });
    if (!done) throw APIError.failedPrecondition("This request no longer waits for an answer");
    return toItem(done);
  }

  /** The managers' list: what waits, and what was answered in the last 30 days. */
  async list(actor: Actor): Promise<SellingAmountRequestItem[]> {
    if (!canDecideQuoteInquiry(actor.role)) throw APIError.permissionDenied("Quote Inquiries are for managers");
    return (await requests.list(actor.companyID, new Date(Date.now() - ANSWERED_DAYS * DAY), LIST_LIMIT)).map(toItem);
  }

  /** What the bell of `actor` shows: requests waiting, for a manager, and answers to what they asked. */
  async forMe(actor: Actor): Promise<{ waiting: SellingAmountRequestItem[]; answers: SellingAmountRequestItem[] }> {
    const now = Date.now();
    const [waiting, answers] = await Promise.all([
      canDecideQuoteInquiry(actor.role) ? requests.pending(actor.companyID, BELL_LIMIT) : Promise.resolve([] as SellingAmountRequestRecord[]),
      requests.answersFor(actor.companyID, actor.userID, new Date(now - ANSWERED_DAYS * DAY), new Date(now - SEEN_KEEP_DAYS * DAY), BELL_LIMIT),
    ]);
    // A manager's own request waits for another manager: it is not news to the one who asked.
    return { waiting: waiting.filter((r) => r.requestedById !== actor.userID).map(toItem), answers: answers.map(toItem) };
  }

  /** The answers were opened by the one who asked: the bell keeps them 7 more days. */
  async seen(actor: Actor, ids: string[]): Promise<void> {
    await requests.markSeen(actor.companyID, actor.userID, ids.filter(isUuid), new Date());
  }

  /** A shipment's requests, for its Costs Breakdown. */
  async ofShipment(actor: Actor, shipmentId: string): Promise<SellingAmountRequestItem[]> {
    if (!isUuid(shipmentId)) throw notFound();
    return (await requests.ofShipment(actor.companyID, shipmentId)).map(toItem);
  }
}

export const sellingAmountRequestService = new SellingAmountRequestService();
