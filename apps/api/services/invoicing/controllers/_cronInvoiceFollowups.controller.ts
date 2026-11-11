import { api } from "encore.dev/api";
import { deliverInvoiceFollowups, startFollowupTimer } from "../services/invoiceFollowups.service";

startFollowupTimer();

interface InvoiceFollowupsResponse {
  sent: number;
  retry: number;
  failed: number;
}

// Called by the cron only (expose: false), without a login: sends what issued invoices and credit
// notes still owe the customers and shipments services.
export const _cronInvoiceFollowups = api(
  { expose: false, auth: false, method: "POST", path: "/internal/invoicing/followups/deliver" },
  async (): Promise<InvoiceFollowupsResponse> => deliverInvoiceFollowups(),
);
