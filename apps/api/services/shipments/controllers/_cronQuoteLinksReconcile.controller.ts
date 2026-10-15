import { api } from "encore.dev/api";
import { quoteLinksService } from "../services/quoteLinks.service";

interface QuoteLinksReconcileResponse {
  /** Companies whose links were compared. */
  companies: number;
  /** Of those, how many failed (logged; tried again next hour). */
  failed: number;
}

// Called by the cron only (expose: false), without a login: compares the links between quotes
// and shipments of every company and repairs those a failed call left wrong.
export const _cronQuoteLinksReconcile = api(
  { expose: false, auth: false, method: "POST", path: "/internal/shipments/quote-links/reconcile" },
  async (): Promise<QuoteLinksReconcileResponse> => quoteLinksService.reconcileAll(),
);
