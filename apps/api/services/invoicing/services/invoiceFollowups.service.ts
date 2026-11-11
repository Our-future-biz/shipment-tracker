import log from "encore.dev/log";
import { customers, shipments } from "~encore/clients";
import { invoiceFollowupOutboxRepository } from "../repositories/invoiceFollowupOutbox.repository";
import { invoiceRepository } from "../repositories/invoice.repository";
import type { InvoiceFollowupOutboxRecord, NewInvoiceFollowupOutboxRecord } from "../schemas/invoiceFollowupOutbox.schema";
import type { InvoiceRecord } from "../schemas/invoice.schema";
import { statusesAfterCredit, statusesAfterIssue, type StatusPatch } from "../lib/shipmentStatus";
import { deliverOutboxRow, runOutboxDelivery, type OutboxHandlers } from "../../../lib/outbox/outboxDelivery";

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

const customerEntry = (doc: InvoiceRecord, status: "Open" | "Credited") => ({
  customerId: doc.customerId,
  invoiceNumber: doc.number,
  amount: Number(doc.gross),
  currency: doc.currency,
  dueDate: doc.dueDate ?? "",
  status,
  issuedAt: doc.issueDate ?? "",
});

/** An invoice: in the customer's list as Open; the shipment Invoiced (and Billing -> Billed). */
export function followupsOfInvoice(invoice: InvoiceRecord, actor: FollowupActor): NewInvoiceFollowupOutboxRecord[] {
  return rowsOf(invoice, invoice.shipmentId, actor, [
    { kind: "customer_invoice", payload: customerEntry(invoice, "Open") },
    { kind: "status_after_issue", payload: { shipmentId: invoice.shipmentId } },
  ]);
}

/**
 * A credit note: in the customer's list as Credited, the invoice it cancels marked Credited there
 * too, and the shipment back in the queue when no invoice of it is left open.
 */
export function followupsOfCreditNote(creditNote: InvoiceRecord, original: InvoiceRecord, actor: FollowupActor): NewInvoiceFollowupOutboxRecord[] {
  return rowsOf(creditNote, original.shipmentId, actor, [
    { kind: "customer_invoice", payload: customerEntry(creditNote, "Credited") },
    { kind: "mark_credited", payload: { invoiceNumbers: [original.number] } },
    { kind: "status_after_credit", payload: { shipmentId: original.shipmentId } },
  ]);
}

const changes = (patch: StatusPatch) => !!(patch.status || patch.invoicingStatus);

/** Sends one follow-up; throws when the service did not take it. Safe to send again. */
export async function sendFollowup(row: InvoiceFollowupOutboxRecord): Promise<void> {
  const authData = { userID: row.actingUserId, companyID: row.companyId, role: row.actingRole };
  const payload = row.payload as Record<string, unknown>;
  switch (row.kind) {
    case "customer_invoice": {
      const p = payload as { customerId: string; invoiceNumber: string; amount: number; currency: string; dueDate: string; status: "Open" | "Credited"; issuedAt: string };
      await customers._internalCustomerInvoicePost(p, { authData });
      return;
    }
    case "mark_credited":
      await customers.invoiceMarkCredited({ invoiceNumbers: payload.invoiceNumbers as string[] }, { authData });
      return;
    case "status_after_issue":
    case "status_after_credit": {
      // Worked out from the shipment as it is now: a status someone moved since is left alone.
      const shipmentId = String(payload.shipmentId);
      const { shipment } = await shipments.shipmentGet({ shipmentId }, { authData });
      const patch =
        row.kind === "status_after_issue"
          ? statusesAfterIssue(shipment)
          : statusesAfterCredit(shipment, await invoiceRepository.countOpenInvoices(shipmentId, row.companyId));
      // The app's own update (a status follows the invoice), not the issuing user's edit of the shipment.
      if (changes(patch)) await shipments.shipmentUpdate({ shipmentId, ...patch }, { authData: { ...authData, appWrite: true } });
      return;
    }
  }
}

const WHAT: Record<string, string> = {
  customer_invoice: "The document could not be added to the customer's invoice list",
  mark_credited: "The credited invoice could not be marked Credited in the customer's invoice list",
  status_after_issue: "The shipment's statuses could not be moved after the invoice",
  status_after_credit: "The shipment's statuses could not be moved after the credit note",
};

const handlers: OutboxHandlers<InvoiceFollowupOutboxRecord> = {
  send: sendFollowup,
  errorText: () => "A service did not take the update",
  async onFailed(row, error, err) {
    await invoiceFollowupOutboxRepository.markFailed(row.id, row.attempts, WHAT[row.kind] ?? error);
    log.error(err, "invoicing: a follow-up of an issued document was not sent for good", { outboxId: row.id, invoiceId: row.invoiceId, kind: row.kind });
  },
  async onRetry(row, error, nextAttemptAt, err) {
    await invoiceFollowupOutboxRepository.markRetry(row.id, row.attempts, WHAT[row.kind] ?? error, nextAttemptAt);
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
