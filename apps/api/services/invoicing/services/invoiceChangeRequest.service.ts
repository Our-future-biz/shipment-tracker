import { APIError } from "encore.dev/api";
import { userEmailOf } from "../../../lib/companyUsers";
import type { Actor } from "../../../lib/rbac";
import { canDecideQuoteInquiry } from "../../../lib/salesPolicy";
import { isUuid } from "../../../lib/uuid";
import { answerProblem } from "../lib/sellingAmount";
import { waitingRequestProblem } from "../lib/waitingRequest";
import { creditNoteRequestRepository as creditRequests } from "../repositories/creditNoteRequest.repository";
import { invoiceRepository } from "../repositories/invoice.repository";
import { invoiceChangeRequestRepository as requests } from "../repositories/invoiceChangeRequest.repository";
import { INVOICE_FIXES, type InvoiceChangeRequestRecord, type InvoiceFix } from "../schemas/invoiceChangeRequest.schema";
import type { InvoiceChangeRequestItem } from "../interfaces/interfaces";
import { invoiceDocumentService, pragueToday } from "./invoiceDocument.service";

// Changing an invoice on the day it was issued (owner's decision, 17 Nov 2026). Anyone who may credit
// an invoice asks for it from the invoice, the same day, ticking what is wrong and saying why. A manager
// answers it on Sales → Managers → Billing approvals, the same day too: approving cancels the invoice
// (services/invoiceDocument cancelOnIssueDay) and its lines are billed again, corrected, under the next
// number; rejecting needs a reason. At midnight (Prague) a request still waiting expires; after that a
// credit note corrects the invoice. One request waits per invoice, a change or a partial credit note
// (user council B5); the one who asked may take it back.

const ANSWERED_DAYS = 30;
const LIST_LIMIT = 300;
const BELL_LIMIT = 100;
const SEEN_KEEP_DAYS = 7;
const DAY = 86_400_000;
const notThere = () => APIError.notFound("This request is not there");
const notIssued = (number: string, status: string) => APIError.failedPrecondition(`Invoice ${number} is ${status} already`);
const creditedInPart = (number: string) => APIError.failedPrecondition(`Invoice ${number} has been credited in part: correct it with a credit note`);

export const toChangeRequestItem = (r: InvoiceChangeRequestRecord): InvoiceChangeRequestItem => ({
  id: r.id,
  shipmentId: r.shipmentId,
  jobNumber: r.jobNumber,
  invoiceId: r.invoiceId,
  invoiceNumber: r.invoiceNumber,
  customerName: r.customerName,
  currency: r.currency,
  gross: r.gross,
  issueDate: r.issueDate,
  fixes: r.fixes,
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

/** The fixes ticked, each once, in the list's order; null when one is not known. */
function fixesOf(input: readonly string[]): InvoiceFix[] | null {
  const known = new Set<string>(INVOICE_FIXES);
  if (input.some((f) => !known.has(f))) return null;
  return INVOICE_FIXES.filter((f) => input.includes(f));
}

class InvoiceChangeRequestService {
  /** Asks a manager to cancel the invoice so it can be issued again corrected: on its issue day only. */
  async ask(actor: Actor, invoiceId: string, input: { fixes: string[]; reason: string }): Promise<InvoiceChangeRequestItem> {
    const reason = (input.reason ?? "").trim();
    if (reason.length < 3) throw APIError.invalidArgument("Say what is wrong with the invoice");
    const fixes = fixesOf(input.fixes ?? []);
    if (!fixes) throw APIError.invalidArgument("Pick what is wrong from the list");
    if (!fixes.length) throw APIError.invalidArgument("Tick what is wrong with the invoice");
    const invoice = isUuid(invoiceId) ? await invoiceRepository.getByIdForCompany(invoiceId, actor.companyID) : null;
    if (!invoice) throw APIError.notFound("Invoice not found");
    if (invoice.kind !== "invoice") throw APIError.failedPrecondition("A credit note can't be changed");
    if (invoice.status !== "issued") throw notIssued(invoice.number, invoice.status);
    if (invoice.issueDate !== pragueToday()) {
      throw APIError.failedPrecondition(`Invoice ${invoice.number} was issued on ${invoice.issueDate}: it can be changed only on its issue day. Correct it with a credit note`);
    }
    if ((await invoiceRepository.creditNotesOf(invoice.id, actor.companyID)).length) throw creditedInPart(invoice.number);
    // Approving a partial credit note would take this change back unasked (user council B5): one waits at a time.
    const credit = await creditRequests.pendingFor(actor.companyID, invoice.id);
    if (credit) throw APIError.failedPrecondition(waitingRequestProblem("credit", credit.requestedAt));
    // Checked again under the invoice's row lock, with the insert (mock council S5-4 / X-3): a partial credit asked a
    // second ago is seen, so the two never both wait - and so is the invoice credited in part or in full, or cancelled,
    // a moment ago (system-21 review), which no change cancels any more.
    const noCreditWaits: Parameters<typeof requests.create>[1] = async (tx) => {
      const current = await invoiceRepository.getInTx(tx, invoice.id, actor.companyID);
      if (!current) throw APIError.notFound("Invoice not found");
      if (current.status !== "issued") throw notIssued(invoice.number, current.status);
      if ((await invoiceRepository.creditNotesOf(invoice.id, actor.companyID, tx)).length) throw creditedInPart(invoice.number);
      const now = await creditRequests.pendingFor(actor.companyID, invoice.id, tx);
      if (now) throw APIError.failedPrecondition(waitingRequestProblem("credit", now.requestedAt));
    };
    const created = await requests.create({
      companyId: actor.companyID,
      shipmentId: invoice.shipmentId,
      jobNumber: invoice.shipment.jobNumber,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      customerName: invoice.customer.companyName,
      currency: invoice.currency,
      gross: invoice.gross,
      issueDate: invoice.issueDate,
      fixes,
      reason,
      requestedById: actor.userID,
      requestedByName: await userEmailOf(actor.userID),
    }, noCreditWaits);
    if (!created) throw APIError.failedPrecondition(`A change of ${invoice.number} already waits for a manager: take it back to ask again`);
    return toChangeRequestItem(created);
  }

  /** A manager's answer, on the invoice's issue day: approving cancels the invoice, rejecting needs a reason. */
  async answer(actor: Actor, id: string, input: { decision: string; comment?: string }): Promise<InvoiceChangeRequestItem> {
    if (!canDecideQuoteInquiry(actor.role)) throw APIError.permissionDenied("Only a manager answers this");
    if (!isUuid(id)) throw notThere();
    const comment = (input.comment ?? "").trim();
    const problem = answerProblem(input.decision, comment);
    if (problem) throw APIError.invalidArgument(problem);
    const request = await requests.byId(actor.companyID, id);
    if (!request) throw notThere();
    if (request.status !== "pending") throw APIError.failedPrecondition(`This request was already ${request.status}${request.decidedByName ? ` by ${request.decidedByName}` : ""}`);
    if (request.issueDate !== pragueToday()) {
      await requests.expire(actor.companyID, id);
      throw APIError.failedPrecondition(`This request expired: invoice ${request.invoiceNumber} was issued on ${request.issueDate}, and only a credit note corrects it now`);
    }
    const userEmail = await userEmailOf(actor.userID);
    if (input.decision === "reject") {
      const done = await requests.reject(actor.companyID, id, { userId: actor.userID, userEmail, comment });
      if (!done) throw APIError.failedPrecondition("This request was answered a moment ago");
      return toChangeRequestItem(done);
    }
    await invoiceDocumentService.cancelOnIssueDay(request, { userId: actor.userID, userEmail, comment });
    const done = await requests.byId(actor.companyID, id);
    if (!done) throw notThere();
    return toChangeRequestItem(done);
  }

  /** The one who asked takes a waiting request back (a manager rejects it instead, with a reason). */
  async withdraw(actor: Actor, id: string): Promise<InvoiceChangeRequestItem> {
    if (!isUuid(id)) throw notThere();
    const row = await requests.byId(actor.companyID, id);
    if (!row) throw notThere();
    if (row.requestedById !== actor.userID) throw APIError.permissionDenied("Only the one who asked can take it back — a manager rejects it, with a reason");
    const done = await requests.withdraw(actor.companyID, id, { id: actor.userID, name: await userEmailOf(actor.userID) });
    if (!done) throw APIError.failedPrecondition("This request no longer waits for an answer");
    return toChangeRequestItem(done);
  }

  /** The managers' list: what waits (from today: older ones expire first), and what was answered in the last 30 days. */
  async list(actor: Actor): Promise<InvoiceChangeRequestItem[]> {
    if (!canDecideQuoteInquiry(actor.role)) throw APIError.permissionDenied("Billing approvals are for managers");
    await requests.expireStale(actor.companyID, pragueToday());
    return (await requests.list(actor.companyID, new Date(Date.now() - ANSWERED_DAYS * DAY), LIST_LIMIT)).map(toChangeRequestItem);
  }

  /** The bell: requests waiting today, for a manager, and answers (or expiries) of what the user asked. */
  async forMe(actor: Actor): Promise<{ waiting: InvoiceChangeRequestItem[]; answers: InvoiceChangeRequestItem[] }> {
    const now = Date.now();
    await requests.expireStale(actor.companyID, pragueToday());
    const [waiting, answers] = await Promise.all([
      canDecideQuoteInquiry(actor.role) ? requests.pending(actor.companyID, BELL_LIMIT) : Promise.resolve([] as InvoiceChangeRequestRecord[]),
      requests.answersFor(actor.companyID, actor.userID, new Date(now - ANSWERED_DAYS * DAY), new Date(now - SEEN_KEEP_DAYS * DAY), BELL_LIMIT),
    ]);
    return { waiting: waiting.filter((r) => r.requestedById !== actor.userID).map(toChangeRequestItem), answers: answers.map(toChangeRequestItem) };
  }

  async seen(actor: Actor, ids: string[]): Promise<void> {
    await requests.markSeen(actor.companyID, actor.userID, ids.filter(isUuid), new Date());
  }

  /** A shipment's requests, for its invoices (a waiting one past its day reads expired). */
  async ofShipment(actor: Actor, shipmentId: string): Promise<InvoiceChangeRequestItem[]> {
    if (!isUuid(shipmentId)) throw APIError.notFound("Shipment not found");
    await requests.expireStale(actor.companyID, pragueToday());
    return (await requests.ofShipment(actor.companyID, shipmentId)).map(toChangeRequestItem);
  }
}

export const invoiceChangeRequestService = new InvoiceChangeRequestService();
