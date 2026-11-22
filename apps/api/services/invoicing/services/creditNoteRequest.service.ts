import { APIError } from "encore.dev/api";
import { userEmailOf } from "../../../lib/companyUsers";
import type { Actor } from "../../../lib/rbac";
import { canDecideQuoteInquiry } from "../../../lib/salesPolicy";
import { isUuid } from "../../../lib/uuid";
import { round2 } from "../lib/invoiceCalc";
import { partialCreditTotals, planPartialCredit, type AskedLine, type RemainingLine } from "../lib/partialCredit";
import { answerProblem } from "../lib/sellingAmount";
import { waitingRequestProblem } from "../lib/waitingRequest";
import { invoiceChangeRequestRepository as changeRequests } from "../repositories/invoiceChangeRequest.repository";
import { invoiceRepository } from "../repositories/invoice.repository";
import { creditNoteRequestRepository as requests } from "../repositories/creditNoteRequest.repository";
import type { CreditNoteRequestRecord } from "../schemas/creditNoteRequest.schema";
import type { CreditNoteRequestItem, CreditOptionsItem, CreditableLineItem } from "../interfaces/interfaces";
import { invoiceDocumentService, pragueToday } from "./invoiceDocument.service";

// Partial credit notes (owner's decision, 17 Nov 2026; lib/partialCredit). Anyone who may credit an
// invoice asks for one from the invoice, line by line, with a reason. A manager answers it on Sales →
// Managers → Billing approvals: approving issues the credit note at once, rejecting needs a reason.
// The one who asked may take it back while it waits. One request waits per invoice, a partial credit
// note or a change on the issue day (user council B5). A credit note of the whole invoice stays instant
// and takes back a request still waiting for it.

const ANSWERED_DAYS = 30;
const LIST_LIMIT = 300;
const BELL_LIMIT = 100;
/** How long the bell keeps an answer after it was opened. */
const SEEN_KEEP_DAYS = 7;
const DAY = 86_400_000;
const notThere = () => APIError.notFound("This request is not there");
const notIssued = (number: string, status: string) =>
  APIError.failedPrecondition(`Invoice ${number} has already been ${status === "cancelled" ? "cancelled" : "credited"}`);

export const toCreditRequestItem = (r: CreditNoteRequestRecord): CreditNoteRequestItem => ({
  id: r.id,
  shipmentId: r.shipmentId,
  jobNumber: r.jobNumber,
  invoiceId: r.invoiceId,
  invoiceNumber: r.invoiceNumber,
  customerName: r.customerName,
  currency: r.currency,
  lines: r.lines,
  net: r.net,
  vat: r.vat,
  gross: r.gross,
  invoiceGross: r.invoiceGross,
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
  creditNoteId: r.creditNoteId,
  creditNoteNumber: r.creditNoteNumber,
});

const lineItem = (r: RemainingLine): CreditableLineItem => ({
  lineId: r.lineId,
  description: r.description,
  qty: r.qty,
  unitPrice: r.unitPrice,
  unitCurrency: r.unitCurrency,
  amount: r.amount,
  remainingAmount: r.remainingAmount,
  fxRate: r.fxRate,
  net: r.net,
  remainingNet: r.remainingNet,
  vatCode: r.vatCode,
  vatRate: r.vatRate,
});

class CreditNoteRequestService {
  /** What the credit dialog shows: what is left of each line, and a request already waiting. */
  async options(actor: Actor, invoiceId: string): Promise<CreditOptionsItem> {
    const { original, credits, remaining } = await invoiceDocumentService.creditState(invoiceId, actor.companyID);
    if (original.kind !== "invoice") throw APIError.failedPrecondition("A credit note cannot be credited");
    const pending = await requests.pendingFor(actor.companyID, original.id);
    return {
      invoiceId: original.id,
      number: original.number,
      currency: original.currency,
      gross: original.gross,
      creditedGross: round2(credits.reduce((s, c) => s + Number(c.gross), 0)).toFixed(2),
      creditNoteNumbers: credits.map((c) => c.number),
      lines: remaining.map(lineItem),
      pendingRequest: pending ? toCreditRequestItem(pending) : null,
    };
  }

  /** Asks a manager to credit the invoice in part; nothing is issued until one approves. */
  async ask(actor: Actor, invoiceId: string, input: { lines: AskedLine[]; reason: string }): Promise<CreditNoteRequestItem> {
    const reason = (input.reason ?? "").trim();
    if (reason.length < 3) throw APIError.invalidArgument("Give the reason for the credit note");
    const { original, credits, remaining } = await invoiceDocumentService.creditState(invoiceId, actor.companyID);
    if (original.kind !== "invoice") throw APIError.failedPrecondition("A credit note cannot be credited");
    if (original.status !== "issued") throw notIssued(original.number, original.status);
    // Approving a change on the issue day would cancel the invoice and take this request back unasked
    // (user council B5): one waits at a time. A change waits on its issue day only; an older one has expired.
    const change = await changeRequests.pendingFor(actor.companyID, original.id);
    if (change && change.issueDate === pragueToday()) throw APIError.failedPrecondition(waitingRequestProblem("change", change.requestedAt));
    const plan = planPartialCredit(remaining, input.lines ?? []);
    if ("problem" in plan) throw APIError.invalidArgument(plan.problem);
    const totals = partialCreditTotals(plan.lines, Number(original.fxRate));
    const userEmail = await userEmailOf(actor.userID);
    // Checked again under the invoice's row lock, with the insert (mock council S5-4 / X-3): a change asked a second
    // ago is seen, so the two never both wait - and so is the invoice credited in full or cancelled, or credited in
    // part since what is left of it was read (system-21 review): the lines asked are then asked again on what is left.
    const noChangeWaits: Parameters<typeof requests.create>[1]["guard"] = async (tx) => {
      const current = await invoiceRepository.getInTx(tx, original.id, actor.companyID);
      if (!current) throw APIError.notFound("Invoice not found");
      if (current.status !== "issued") throw notIssued(original.number, current.status);
      if ((await invoiceRepository.creditNotesOf(original.id, actor.companyID, tx)).length !== credits.length) {
        throw APIError.failedPrecondition(`Invoice ${original.number} was credited in part a moment ago: open it again to see what is left to credit`);
      }
      const now = await changeRequests.pendingFor(actor.companyID, original.id, tx);
      if (now && now.issueDate === pragueToday()) throw APIError.failedPrecondition(waitingRequestProblem("change", now.requestedAt));
    };
    const created = await requests.create({
      companyId: actor.companyID,
      shipmentId: original.shipmentId,
      jobNumber: original.shipment.jobNumber,
      invoiceId: original.id,
      invoiceNumber: original.number,
      customerName: original.customer.companyName,
      currency: original.currency,
      lines: plan.lines.map((l) => ({ lineId: l.correctsLineId, description: l.description, unitCurrency: l.unitCurrency, amount: l.unitPrice.toFixed(2), net: (-l.net).toFixed(2) })),
      // The credit note's totals are negative; the request shows what comes off.
      net: (-totals.net).toFixed(2),
      vat: (-totals.vat).toFixed(2),
      gross: (-totals.gross).toFixed(2),
      invoiceGross: original.gross,
      reason,
      requestedById: actor.userID,
      requestedByName: userEmail,
    }, {
      // The rows the lines credit, as the approval works them out (invoiceDocument issuePartialCredit): what is owed on
      // them is kept with the request, and its approval is refused once it is not what is owed (review of system-22).
      creditedRows: plan.lines.flatMap((l) => (l.sourceSellingCostId ? [l.sourceSellingCostId] : [])),
      guard: noChangeWaits,
    });
    if (!created) throw APIError.failedPrecondition(`A partial credit note of ${original.number} already waits for a manager: take it back to ask again`);
    return toCreditRequestItem(created);
  }

  /** A manager's answer: approving issues the credit note, rejecting needs a reason. */
  async answer(actor: Actor, id: string, input: { decision: string; comment?: string }): Promise<CreditNoteRequestItem> {
    if (!canDecideQuoteInquiry(actor.role)) throw APIError.permissionDenied("Only a manager answers this");
    if (!isUuid(id)) throw notThere();
    const comment = (input.comment ?? "").trim();
    const problem = answerProblem(input.decision, comment);
    if (problem) throw APIError.invalidArgument(problem);
    const request = await requests.byId(actor.companyID, id);
    if (!request) throw notThere();
    if (request.status !== "pending") throw APIError.failedPrecondition(`This request was already ${request.status}${request.decidedByName ? ` by ${request.decidedByName}` : ""}`);
    const userEmail = await userEmailOf(actor.userID);
    if (input.decision === "reject") {
      const done = await requests.reject(actor.companyID, id, { userId: actor.userID, userEmail, comment });
      if (!done) throw APIError.failedPrecondition("This request was answered a moment ago");
      return toCreditRequestItem(done);
    }
    await invoiceDocumentService.issuePartialCredit(request, { userId: actor.userID, userEmail, comment });
    const done = await requests.byId(actor.companyID, id);
    if (!done) throw notThere();
    return toCreditRequestItem(done);
  }

  /**
   * The one who asked takes a waiting request back. A manager answers it instead: a rejection
   * carries its reason and reaches the one who asked, a withdrawal would do neither.
   */
  async withdraw(actor: Actor, id: string): Promise<CreditNoteRequestItem> {
    if (!isUuid(id)) throw notThere();
    const row = await requests.byId(actor.companyID, id);
    if (!row) throw notThere();
    if (row.requestedById !== actor.userID) throw APIError.permissionDenied("Only the one who asked can take it back — a manager rejects it, with a reason");
    const done = await requests.withdraw(actor.companyID, id, { id: actor.userID, name: await userEmailOf(actor.userID) });
    if (!done) throw APIError.failedPrecondition("This request no longer waits for an answer");
    return toCreditRequestItem(done);
  }

  /** The managers' list: what waits, and what was answered in the last 30 days. */
  async list(actor: Actor): Promise<CreditNoteRequestItem[]> {
    if (!canDecideQuoteInquiry(actor.role)) throw APIError.permissionDenied("Billing approvals are for managers");
    return (await requests.list(actor.companyID, new Date(Date.now() - ANSWERED_DAYS * DAY), LIST_LIMIT)).map(toCreditRequestItem);
  }

  /** What the bell of `actor` shows: requests waiting, for a manager, and answers to what they asked. */
  async forMe(actor: Actor): Promise<{ waiting: CreditNoteRequestItem[]; answers: CreditNoteRequestItem[] }> {
    const now = Date.now();
    const [waiting, answers] = await Promise.all([
      canDecideQuoteInquiry(actor.role) ? requests.pending(actor.companyID, BELL_LIMIT) : Promise.resolve([] as CreditNoteRequestRecord[]),
      requests.answersFor(actor.companyID, actor.userID, new Date(now - ANSWERED_DAYS * DAY), new Date(now - SEEN_KEEP_DAYS * DAY), BELL_LIMIT),
    ]);
    // A manager's own request waits for another manager: it is not news to the one who asked.
    return { waiting: waiting.filter((r) => r.requestedById !== actor.userID).map(toCreditRequestItem), answers: answers.map(toCreditRequestItem) };
  }

  /** The answers were opened by the one who asked: the bell keeps them 7 more days. */
  async seen(actor: Actor, ids: string[]): Promise<void> {
    await requests.markSeen(actor.companyID, actor.userID, ids.filter(isUuid), new Date());
  }

  /** A shipment's requests, for its Invoice tab. */
  async ofShipment(actor: Actor, shipmentId: string): Promise<CreditNoteRequestItem[]> {
    if (!isUuid(shipmentId)) throw APIError.notFound("Shipment not found");
    return (await requests.ofShipment(actor.companyID, shipmentId)).map(toCreditRequestItem);
  }
}

export const creditNoteRequestService = new CreditNoteRequestService();
