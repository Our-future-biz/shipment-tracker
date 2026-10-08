import { computeTotals, fmt, type SalesQuote } from "@/app/sales/_lib/salesQuote";
import { QUOTE_STATUSES } from "@/app/sales/_lib/types";

// How a customer's sales quotes are grouped and totalled, for the Quotes tab and the Overview.

// "Open" means what the Sales pipeline shows as still in play: every lifecycle status that is
// neither decided (won / lost) nor expired. Sales exports the statuses but no open list, so the
// open ones are derived from its list instead of being copied here.
const CLOSED_STATUSES = ["won", "lost", "expired"];
const OPEN_STATUSES = new Set(QUOTE_STATUSES.filter((s) => !CLOSED_STATUSES.includes(s.key)).map((s) => s.key));

// The bucket a quote counts in: "open" for every open status, otherwise the status itself
// ("won", "lost", "expired").
export function quoteBucket(quote: SalesQuote): string {
  const status = quote.data.quoteStatus ?? "";
  return OPEN_STATUSES.has(status) ? "open" : status;
}

// A quote whose currency was never changed stores none; Sales shows such a quote in EUR.
export const DEFAULT_QUOTE_CURRENCY = "EUR";

export const quoteHref = (quoteNumber: string) => `/sales/quote/${quoteNumber}`;

// Quotes are priced in their own currency, so their selling value is summed per currency, never
// across: "12,000 EUR · 3,000 USD". Empty when there is nothing to add up.
export function sellingByCurrency(quotes: SalesQuote[]): string {
  const totals = new Map<string, number>();
  for (const quote of quotes) {
    const currency = quote.data.currency || DEFAULT_QUOTE_CURRENCY;
    totals.set(currency, (totals.get(currency) ?? 0) + computeTotals(quote.data).selling);
  }
  return [...totals]
    .filter(([, amount]) => amount !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => fmt(amount, currency))
    .join(" · ");
}
