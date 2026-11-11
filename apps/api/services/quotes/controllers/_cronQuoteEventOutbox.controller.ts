import { api } from "encore.dev/api";
import { CronJob } from "encore.dev/cron";
import { deliverQuoteEvents, startQuoteEventTimer } from "../services/quoteEvents.service";

startQuoteEventTimer();

interface QuoteEventOutboxResponse {
  sent: number;
  retry: number;
  failed: number;
}

// Called by the cron only (expose: false), without a login: publishes the quote-renamed events not
// published straight after their rename.
export const _cronQuoteEventOutbox = api(
  { expose: false, auth: false, method: "POST", path: "/internal/quotes/event-outbox/deliver" },
  async (): Promise<QuoteEventOutboxResponse> => deliverQuoteEvents(),
);

export const quotesEventOutbox = new CronJob("quotes-event-outbox", {
  title: "Publish quote renames",
  every: "1m",
  endpoint: _cronQuoteEventOutbox,
});
