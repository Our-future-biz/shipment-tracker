import log from "encore.dev/log";
import { quoteEventOutboxRepository } from "../repositories/quoteEventOutbox.repository";
import type { QuoteEventOutboxRecord } from "../schemas/quoteEventOutbox.schema";
import { quoteRenamed } from "../topics";
import { deliverOutboxRow, runOutboxDelivery, type OutboxHandlers } from "../../../lib/outbox/outboxDelivery";

// The `quote-renamed` topic, published after commit. A rename writes its event to quote_event_outbox in
// its own transaction (quoteRename.repository); after the commit it is published (deliverQuoteEvents
// with the quote's id). What could not be published then is retried by the quotes-event-outbox cron.

const handlers: OutboxHandlers<QuoteEventOutboxRecord> = {
  async send(row) {
    await quoteRenamed.publish(row.event);
  },
  errorText: () => "The quote's rename could not be published",
  async onFailed(row, error, err) {
    await quoteEventOutboxRepository.markFailed(row.id, row.attempts, error);
    log.error(err, "quotes: quote-renamed not published for good", { outboxId: row.id, from: row.event.from, to: row.event.to });
  },
  async onRetry(row, error, nextAttemptAt, err) {
    await quoteEventOutboxRepository.markRetry(row.id, row.attempts, error, nextAttemptAt);
    log.warn("quotes: quote-renamed will be published again", { outboxId: row.id, error: err instanceof Error ? err.message : String(err) });
  },
  async onSent(row) {
    await quoteEventOutboxRepository.markSent(row.id, row.attempts);
  },
};

/** Publishes what is due (with a quote id, only that quote's events). Never throws. */
export async function deliverQuoteEvents(quoteId?: string) {
  return runOutboxDelivery({
    claim: (limit) => quoteEventOutboxRepository.claimDue(limit, quoteId),
    deliver: (row) => deliverOutboxRow(row, handlers),
    onError: (err) => log.error(err, "quotes: quote event publish run failed"),
  });
}

const TICK_MS = 60_000;
let started = false;

// Encore cron jobs do not fire under `encore run`, so a minute timer does the same job locally.
export function startQuoteEventTimer(): void {
  if (started || process.env.VITEST) return;
  started = true;
  setInterval(() => void deliverQuoteEvents(), TICK_MS).unref();
}
