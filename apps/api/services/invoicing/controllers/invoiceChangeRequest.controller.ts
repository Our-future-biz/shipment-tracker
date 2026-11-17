import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { invoiceChangeRequestService } from "../services/invoiceChangeRequest.service";
import type { InvoiceChangeRequestItem, InvoiceFixItem } from "../interfaces/interfaces";

// Changing an invoice on its issue day: asked from the invoice, approved by a manager on Sales →
// Managers → Billing approvals, which cancels it to be issued again corrected (services/invoiceChangeRequest).

interface AskChangeRequest {
  invoiceId: string;
  /** What is wrong with the invoice */
  fixes: InvoiceFixItem[] & MaxLen<6>;
  /** Why */
  reason: string & MaxLen<1000>;
}

/** Asks a manager to cancel the invoice so it can be issued again corrected: on its issue day only. */
export const invoiceChangeAsk = api(
  { expose: true, auth: true, method: "POST", path: "/invoices/:invoiceId/change-requests" },
  async ({ invoiceId, ...input }: AskChangeRequest): Promise<{ request: InvoiceChangeRequestItem }> => ({
    request: await invoiceChangeRequestService.ask(getAuthData()!, invoiceId, input),
  }),
);

export const invoicingInvoiceChangeRequestsOfShipment = api(
  { expose: true, auth: true, method: "GET", path: "/invoicing/:shipmentId/invoice-change-requests" },
  async ({ shipmentId }: { shipmentId: string }): Promise<{ requests: InvoiceChangeRequestItem[] }> => ({
    requests: await invoiceChangeRequestService.ofShipment(getAuthData()!, shipmentId),
  }),
);

/** The managers' list (Billing approvals): what waits today, and what was answered in the last 30 days. */
export const invoiceChangeRequestList = api(
  { expose: true, auth: true, method: "GET", path: "/invoice-change-requests" },
  async (): Promise<{ requests: InvoiceChangeRequestItem[] }> => ({ requests: await invoiceChangeRequestService.list(getAuthData()!) }),
);

/** The bell: requests waiting, for a manager, and answers to what the user asked. */
export const invoiceChangeRequestForMe = api(
  { expose: true, auth: true, method: "GET", path: "/invoice-change-requests/for-me" },
  async (): Promise<{ waiting: InvoiceChangeRequestItem[]; answers: InvoiceChangeRequestItem[] }> => invoiceChangeRequestService.forMe(getAuthData()!),
);

export const invoiceChangeRequestSeen = api(
  { expose: true, auth: true, method: "POST", path: "/invoice-change-requests/seen" },
  async ({ ids }: { ids: string[] & MaxLen<200> }): Promise<void> => {
    await invoiceChangeRequestService.seen(getAuthData()!, ids);
  },
);

interface DecideChangeRequest {
  id: string;
  decision: "approve" | "reject";
  comment?: string & MaxLen<1000>;
}

/** A manager's answer, on the invoice's issue day: approving cancels the invoice at once. */
export const invoiceChangeRequestDecide = api(
  { expose: true, auth: true, method: "POST", path: "/invoice-change-requests/:id/decide" },
  async ({ id, ...answer }: DecideChangeRequest): Promise<{ request: InvoiceChangeRequestItem }> => ({
    request: await invoiceChangeRequestService.answer(getAuthData()!, id, answer),
  }),
);

export const invoiceChangeRequestWithdraw = api(
  { expose: true, auth: true, method: "POST", path: "/invoice-change-requests/:id/withdraw" },
  async ({ id }: { id: string }): Promise<{ request: InvoiceChangeRequestItem }> => ({
    request: await invoiceChangeRequestService.withdraw(getAuthData()!, id),
  }),
);
