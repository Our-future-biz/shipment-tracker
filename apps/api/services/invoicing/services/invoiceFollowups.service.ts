import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { customers, shipments } from "~encore/clients";
import { carryOverBeforeTelling, NOT_CHECKED } from "./receivableCarryOver";
import { invoiceFollowupOutboxRepository } from "../repositories/invoiceFollowupOutbox.repository";
import type { InvoiceFollowupOutboxRecord, NewInvoiceFollowupOutboxRecord } from "../schemas/invoiceFollowupOutbox.schema";
import type { InvoiceRecord } from "../schemas/invoice.schema";
import { invoiceRepository } from "../repositories/invoice.repository";
import { sellingCostRepository } from "../repositories/sellingCost.repository";
import { countInvoicedLines } from "../lib/billingQueue";
import { statusesAfterCredit, statusesAfterIssue, type ChargeCount, type StatusPatch } from "../lib/shipmentStatus";
import { deliverOutboxRow, runOutboxDelivery, type OutboxHandlers } from "../../../lib/outbox/outboxDelivery";
import { receivableRepository } from "../repositories/receivable.repository";
import { customerListStateOf, lastPaidOnOf, settledOther } from "../lib/receivables";

// What an issued invoice or credit note owes the other services (schemas/invoiceFollowupOutbox):
// written in the issue's own transaction (followupsOfInvoice / followupsOfCreditNote), sent straight
// after the commit (deliverInvoiceFollowups with the document's id), and retried by the
// invoicing-followups cron (and the local minute timer) while a service does not take it.

/** Who the follow-ups are sent as: the user who issued the document. */
export interface FollowupActor {
  userId: string;
  role: string;
}

type Row = Omit<NewInvoiceFollowupOutboxRecord, "companyId" | "invoiceId" | "shipmentId" | "actingUserId" | "actingRole">;

const rowsOf = (doc: InvoiceRecord, shipmentId: string, actor: FollowupActor, rows: Row[]): NewInvoiceFollowupOutboxRecord[] =>
  rows.map((r) => ({ ...r, companyId: doc.companyId, invoiceId: doc.id, shipmentId, actingUserId: actor.userId, actingRole: actor.role }));

const customerEntry = (doc: InvoiceRecord, status: "Open" | "Credited", dueDate = doc.dueDate) => ({
  // The document itself, so the customer's row is linked to it (Accounts Receivable)
  invoiceId: doc.id,
  customerId: doc.customerId,
  invoiceNumber: doc.number,
  amount: Number(doc.gross),
  currency: doc.currency,
  dueDate: dueDate ?? "",
  status,
  issuedAt: doc.issueDate ?? "",
});

/** An invoice: in the customer's list as Open; the shipment Invoiced (and Billing -> Billed) once it bills the last charge. */
export function followupsOfInvoice(invoice: InvoiceRecord, actor: FollowupActor): NewInvoiceFollowupOutboxRecord[] {
  return rowsOf(invoice, invoice.shipmentId, actor, [
    { kind: "customer_invoice", payload: customerEntry(invoice, "Open") },
    { kind: "status_after_issue", payload: { shipmentId: invoice.shipmentId } },
  ]);
}

/**
 * What is left to pay on an invoice (Finance → Accounts Receivable), on its row in the customer's list: read fresh when
 * the row is sent, so it is safe to send again and a later state is never overwritten by an older one.
 */
const receivableState = (invoice: Pick<InvoiceRecord, "id">) => ({ kind: "receivable_state" as const, payload: { invoiceId: invoice.id } });

/** A payment noted or taken back on Accounts Receivable: the customer's list follows (written in the same transaction). */
export function followupsOfReceivable(invoice: InvoiceRecord, actor: FollowupActor): NewInvoiceFollowupOutboxRecord[] {
  return rowsOf(invoice, invoice.shipmentId, actor, [receivableState(invoice)]);
}

/**
 * A credit note of the whole invoice (or of what partial ones left of it): in the customer's list as
 * Credited, the invoice it cancels and its partial credit notes marked Credited there too, and the
 * shipment back in the queue when a charge of it is no longer invoiced. Last, what is left of the invoice
 * (a payment kept: to refund, D14).
 */
export function followupsOfCreditNote(
  creditNote: InvoiceRecord,
  original: InvoiceRecord,
  actor: FollowupActor,
  partialCreditNoteNumbers: string[] = [],
): NewInvoiceFollowupOutboxRecord[] {
  return rowsOf(creditNote, original.shipmentId, actor, [
    { kind: "customer_invoice", payload: customerEntry(creditNote, "Credited") },
    { kind: "mark_credited", payload: { invoiceNumbers: [original.number, ...partialCreditNoteNumbers] } },
    { kind: "status_after_credit", payload: { shipmentId: original.shipmentId } },
    receivableState(original),
  ]);
}

/**
 * An invoice cancelled on its issue day (services/invoiceChangeRequest): Cancelled in the customer's
 * list, so it is no longer owed, and the shipment back in the queue - its lines are billed again.
 */
export function followupsOfCancellation(invoice: InvoiceRecord, actor: FollowupActor): NewInvoiceFollowupOutboxRecord[] {
  return rowsOf(invoice, invoice.shipmentId, actor, [
    { kind: "mark_credited", payload: { invoiceNumbers: [invoice.number], status: "Cancelled" } },
    { kind: "status_after_credit", payload: { shipmentId: invoice.shipmentId } },
  ]);
}

/**
 * A partial credit note (lib/partialCredit): in the customer's list as Open with its negative amount,
 * due with the invoice, so what the customer owes drops by it; the invoice stays Open with the rest.
 * The shipment's statuses are looked at again, as after any credit note; last, what is left of the invoice
 * (the credit note is netted into it on its row).
 */
export function followupsOfPartialCreditNote(creditNote: InvoiceRecord, original: InvoiceRecord, actor: FollowupActor): NewInvoiceFollowupOutboxRecord[] {
  return rowsOf(creditNote, original.shipmentId, actor, [
    { kind: "customer_invoice", payload: customerEntry(creditNote, "Open", original.dueDate) },
    { kind: "status_after_credit", payload: { shipmentId: original.shipmentId } },
    receivableState(original),
  ]);
}

/** A selling line written by hand on a job that has an open invoice, as its follow-up names it. */
export interface SellingChange {
  companyId: string;
  shipmentId: string;
  /**
   * The invoice the row is kept under: the job's newest open one (repositories/invoice.repository
   * latestOpenInvoiceId), else - for a charge added to a job with none open - its newest invoice of
   * any state (latestInvoiceId): the outbox row needs one, and what it does is worked out from the job.
   */
  invoiceId: string;
  /** lib/shipmentStatus chargeChangeOf: the line became a charge (or its value changed), or stopped being one. */
  change: "added" | "removed";
  /** The line in words, for the shipment's history: "Demurrage 300.00 EUR". */
  charge: string;
}

/**
 * A charge added after invoicing - a valued selling line, or one given a value (allowed: it goes on
 * the next invoice) - leaves the job with a charge not invoiced: its statuses are looked at as after
 * a credit note, so a job that read Invoiced goes back to Not Invoiced (and Billed back to Billing).
 * A charge taken away again (deleted, or its value set to nothing) is looked at as after an issue:
 * Invoiced again once the rest is all invoiced. Either is worked out when the row is sent, from the
 * job as it is then (sendFollowup), so a status someone moved meanwhile is left alone.
 */
export function followupsOfSellingChange(sale: SellingChange, actor: FollowupActor): NewInvoiceFollowupOutboxRecord[] {
  const kind = sale.change === "added" ? ("status_after_credit" as const) : ("status_after_issue" as const);
  return [
    {
      companyId: sale.companyId,
      invoiceId: sale.invoiceId,
      shipmentId: sale.shipmentId,
      actingUserId: actor.userId,
      actingRole: actor.role,
      kind,
      payload: { shipmentId: sale.shipmentId, charge: sale.charge },
    },
  ];
}

/**
 * The job's charges: its selling lines with a value, ticked for Invoice or not, and how many of
 * them are on an issued, not credited invoice (the queue's Lines Invoiced). All of them must be
 * before the job is Invoiced (lib/shipmentStatus).
 */
export async function chargeCountOf(shipmentId: string, companyId: string): Promise<ChargeCount> {
  const [rows, openInvoices] = await Promise.all([
    sellingCostRepository.listLiveByShipments([shipmentId], companyId),
    invoiceRepository.listOpenInvoicesWithSources([shipmentId], companyId),
  ]);
  return countInvoicedLines(rows, openInvoices).get(shipmentId) ?? { invoiced: 0, total: 0 };
}

const changes = (patch: StatusPatch) => !!(patch.status || patch.invoicingStatus);

/**
 * What the customer's list is told of an invoice now: what is left to pay after its credit notes, live payments and
 * confirmed write-offs / bank charges,
 * the last day paid, whether it is settled, its own status (a credited or cancelled one is never Paid there), and its
 * partial credit notes (netted into it). null when it is not there. An invoice whose old Paid in the customer's list
 * was not carried over yet is carried over first, so that Paid is never overwritten by "owed"; when the customer's list
 * can't be asked this throws a retryable error (the follow-up is sent again later).
 */
export async function receivableStateNow(companyId: string, invoiceId: string) {
  let figures = await receivableRepository.figuresOne(companyId, invoiceId);
  if (!figures) return null;
  if (!figures.receivable?.carriedChecked) {
    await carryOverBeforeTelling(companyId, invoiceId);
    figures = await receivableRepository.figuresOne(companyId, invoiceId);
    if (!figures) return null;
    if (!figures.receivable?.carriedChecked) throw APIError.unavailable(NOT_CHECKED);
  }
  const invoice = figures.invoice;
  const [creditNotes, payments] = await Promise.all([
    receivableRepository.creditNotesOf(companyId, [invoice.id]),
    receivableRepository.paymentsOf(companyId, [invoice.id]),
  ]);
  // A credited invoice's last credit note is the one of the whole invoice; the others were partial.
  const partial = invoice.status === "credited" ? creditNotes.slice(0, -1) : creditNotes;
  const { leftToPay, settled } = customerListStateOf({
    invoiceStatus: invoice.status,
    gross: Number(invoice.gross),
    credited: figures.credited,
    paid: figures.paid,
    // A confirmed write-off or bank charge closes what is left too (step 7).
    settledOther: settledOther(figures),
  });
  return {
    customerId: invoice.customerId,
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    leftToPay,
    lastPaidOn: lastPaidOnOf(payments),
    settled,
    invoiceStatus: invoice.status,
    creditNoteNumbers: partial.map((c) => c.number),
  };
}

/**
 * Moves the shipment's statuses after its charges, worked out from the shipment as it is now: a
 * status someone moved since is left alone. "status_after_issue": Invoiced once the last charge is on
 * an open invoice; "status_after_credit": back when one is not. Throws when Shipments does not answer.
 */
export async function followStatuses(companyId: string, shipmentId: string, kind: "status_after_issue" | "status_after_credit", actor: FollowupActor): Promise<void> {
  const authData = { userID: actor.userId, companyID: companyId, role: actor.role };
  const { shipment } = await shipments.shipmentGet({ shipmentId }, { authData });
  const charges = await chargeCountOf(shipmentId, companyId);
  const patch = kind === "status_after_issue" ? statusesAfterIssue(shipment, charges) : statusesAfterCredit(shipment, charges);
  // The app's own update (a status follows the invoice), not the issuing user's edit of the shipment.
  // A selling line's row carries the line in words (`charge`); the shipment's history records the
  // status change as this user's, and does not name the line yet - shipmentUpdate takes no line of its own.
  if (changes(patch)) await shipments.shipmentUpdate({ shipmentId, ...patch }, { authData: { ...authData, appWrite: true } });
}

/** Sends one follow-up; throws when the service did not take it. Safe to send again. */
export async function sendFollowup(row: InvoiceFollowupOutboxRecord): Promise<void> {
  const authData = { userID: row.actingUserId, companyID: row.companyId, role: row.actingRole };
  const payload = row.payload as Record<string, unknown>;
  switch (row.kind) {
    case "customer_invoice": {
      const p = payload as { customerId: string; invoiceNumber: string; amount: number; currency: string; dueDate: string; status: "Open" | "Credited"; issuedAt: string; invoiceId?: string };
      await customers._internalCustomerInvoicePost(p, { authData });
      return;
    }
    case "mark_credited":
      // Cancelled for an invoice withdrawn on its issue day; Credited otherwise (the rows from before carry no status).
      await customers.invoiceMarkCredited(
        { invoiceNumbers: payload.invoiceNumbers as string[], ...(payload.status === "Cancelled" ? { status: "Cancelled" as const } : {}) },
        { authData },
      );
      return;
    case "status_after_issue":
    case "status_after_credit":
      await followStatuses(row.companyId, String(payload.shipmentId), row.kind, { userId: row.actingUserId, role: row.actingRole });
      return;
    case "receivable_state": {
      // The state as it is now (not as when the row was written): safe to repeat, never older than what was sent.
      const state = await receivableStateNow(row.companyId, String(payload.invoiceId));
      if (!state) return;
      // A row the customer's list does not have answers ok: false: nothing to update, not an error.
      await customers._internalCustomerInvoiceReceivable(state, { authData });
      return;
    }
  }
}

const WHAT: Record<string, string> = {
  customer_invoice: "The document could not be added to the customer's invoice list",
  mark_credited: "The credited or cancelled invoice could not be marked so in the customer's invoice list",
  status_after_issue: "The shipment's statuses could not be moved after the invoice",
  status_after_credit: "The shipment's statuses could not be moved after the credit note",
  receivable_state: "What is left to pay could not be updated in the customer's invoice list",
};

/** What the outbox says of a row that was not sent: a selling line's own row names the line, not a document. */
const whatOf = (row: InvoiceFollowupOutboxRecord, error: string): string => {
  const charge = (row.payload as { charge?: unknown }).charge;
  if (typeof charge === "string" && charge) return `The shipment's statuses could not be moved after a charge changed (${charge})`;
  return WHAT[row.kind] ?? error;
};

const handlers: OutboxHandlers<InvoiceFollowupOutboxRecord> = {
  send: sendFollowup,
  errorText: () => "A service did not take the update",
  async onFailed(row, error, err) {
    await invoiceFollowupOutboxRepository.markFailed(row.id, row.attempts, whatOf(row, error));
    log.error(err, "invoicing: a follow-up of an issued document was not sent for good", { outboxId: row.id, invoiceId: row.invoiceId, kind: row.kind });
  },
  async onRetry(row, error, nextAttemptAt, err) {
    await invoiceFollowupOutboxRepository.markRetry(row.id, row.attempts, whatOf(row, error), nextAttemptAt);
    log.warn("invoicing: a follow-up of an issued document will be sent again", { outboxId: row.id, invoiceId: row.invoiceId, kind: row.kind, error: err instanceof Error ? err.message : String(err) });
  },
  async onSent(row) {
    await invoiceFollowupOutboxRepository.markSent(row.id, row.attempts);
  },
};

/** Sends what is due (with an invoice id, only that document's follow-ups). Never throws. */
export async function deliverInvoiceFollowups(invoiceId?: string) {
  return runOutboxDelivery({
    claim: (limit) => invoiceFollowupOutboxRepository.claimDue(limit, invoiceId),
    deliver: (row) => deliverOutboxRow(row, handlers),
    onError: (err) => log.error(err, "invoicing: follow-up delivery run failed"),
  });
}

const TICK_MS = 60_000;
let started = false;

// Encore cron jobs do not fire under `encore run`, so a minute timer does the same job locally (as
// the warehouse and trucking outboxes do). In the cloud both run; SKIP LOCKED claims keep them apart.
export function startFollowupTimer(): void {
  if (started || process.env.VITEST) return;
  started = true;
  setInterval(() => void deliverInvoiceFollowups(), TICK_MS).unref();
}
