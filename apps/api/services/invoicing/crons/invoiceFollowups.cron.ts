import { CronJob } from "encore.dev/cron";
import { _cronInvoiceFollowups } from "../controllers/_cronInvoiceFollowups.controller";

// Sends what issued invoices and credit notes still owe the customers and shipments services (the
// customer's invoice list, the Credited mark, the shipment's statuses), with retries. Cron jobs don't
// fire under `encore run` - locally the minute timer in invoiceFollowups.service does it.
export const invoiceFollowups = new CronJob("invoicing-followups", {
  title: "Send invoice follow-ups",
  every: "1m",
  endpoint: _cronInvoiceFollowups,
});
