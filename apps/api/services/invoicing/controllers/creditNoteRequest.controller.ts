import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { creditNoteRequestService } from "../services/creditNoteRequest.service";
import type { CreditNoteRequestItem, CreditOptionsItem } from "../interfaces/interfaces";

// Partial credit notes: asked from the invoice with a reason, approved by a manager on Sales →
// Managers → Billing approvals, which issues the credit note (services/creditNoteRequest).

/** The credit dialog: what is left of each line of the invoice, and a request already waiting. */
export const invoiceCreditOptions = api(
  { expose: true, auth: true, method: "GET", path: "/invoices/:invoiceId/credit-options" },
  async ({ invoiceId }: { invoiceId: string }): Promise<{ options: CreditOptionsItem }> => ({
    options: await creditNoteRequestService.options(getAuthData()!, invoiceId),
  }),
);

interface AskPartialCreditRequest {
  invoiceId: string;
  /** The lines to credit, each by an amount in the line's own currency */
  lines: { lineId: string; amount: string & MaxLen<20> }[] & MaxLen<200>;
  /** Why (printed on the credit note) */
  reason: string & MaxLen<1000>;
}

/** Asks a manager to credit the invoice in part: nothing is issued until one approves. */
export const invoicePartialCreditAsk = api(
  { expose: true, auth: true, method: "POST", path: "/invoices/:invoiceId/partial-credit-requests" },
  async ({ invoiceId, ...input }: AskPartialCreditRequest): Promise<{ request: CreditNoteRequestItem }> => ({
    request: await creditNoteRequestService.ask(getAuthData()!, invoiceId, input),
  }),
);

export const invoicingCreditNoteRequestsOfShipment = api(
  { expose: true, auth: true, method: "GET", path: "/invoicing/:shipmentId/credit-note-requests" },
  async ({ shipmentId }: { shipmentId: string }): Promise<{ requests: CreditNoteRequestItem[] }> => ({
    requests: await creditNoteRequestService.ofShipment(getAuthData()!, shipmentId),
  }),
);

/** The managers' list (Billing approvals): what waits, and what was answered in the last 30 days. */
export const creditNoteRequestList = api(
  { expose: true, auth: true, method: "GET", path: "/credit-note-requests" },
  async (): Promise<{ requests: CreditNoteRequestItem[] }> => ({ requests: await creditNoteRequestService.list(getAuthData()!) }),
);

/** The bell: requests waiting, for a manager, and answers to what the user asked. */
export const creditNoteRequestForMe = api(
  { expose: true, auth: true, method: "GET", path: "/credit-note-requests/for-me" },
  async (): Promise<{ waiting: CreditNoteRequestItem[]; answers: CreditNoteRequestItem[] }> => creditNoteRequestService.forMe(getAuthData()!),
);

export const creditNoteRequestSeen = api(
  { expose: true, auth: true, method: "POST", path: "/credit-note-requests/seen" },
  async ({ ids }: { ids: string[] & MaxLen<200> }): Promise<void> => {
    await creditNoteRequestService.seen(getAuthData()!, ids);
  },
);

interface DecideCreditRequest {
  id: string;
  decision: "approve" | "reject";
  comment?: string & MaxLen<1000>;
}

/** A manager's answer: approving issues the credit note at once. */
export const creditNoteRequestDecide = api(
  { expose: true, auth: true, method: "POST", path: "/credit-note-requests/:id/decide" },
  async ({ id, ...answer }: DecideCreditRequest): Promise<{ request: CreditNoteRequestItem }> => ({
    request: await creditNoteRequestService.answer(getAuthData()!, id, answer),
  }),
);

export const creditNoteRequestWithdraw = api(
  { expose: true, auth: true, method: "POST", path: "/credit-note-requests/:id/withdraw" },
  async ({ id }: { id: string }): Promise<{ request: CreditNoteRequestItem }> => ({
    request: await creditNoteRequestService.withdraw(getAuthData()!, id),
  }),
);
