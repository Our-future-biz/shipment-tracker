import { CronJob } from "encore.dev/cron";
import { _cronQuoteLinksReconcile } from "../controllers/_cronQuoteLinksReconcile.controller";

// Hourly repair of the links between sales quotes and the shipments that name them, off the
// request path (it used to run inside GET /shipments). Cron jobs don't fire under `encore run`;
// locally a manager can run it with POST /shipment-quote-links/sync.
export const quoteLinksReconcile = new CronJob("shipments-quote-links-reconcile", {
  title: "Reconcile quote ↔ shipment links",
  every: "1h",
  endpoint: _cronQuoteLinksReconcile,
});
