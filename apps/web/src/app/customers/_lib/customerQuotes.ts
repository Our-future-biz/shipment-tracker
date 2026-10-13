import type { ExchangeRates } from "@/lib/exchangeRates";
import { computeTotals, sellingSum, type SalesQuote } from "@/app/sales/_lib/salesQuote";
import { OPEN_QUOTE_STATUSES } from "@/app/sales/_lib/types";

// How a customer's sales quotes are grouped and totalled, for the Quotes tab and the Overview.

// "Open" means what Sales means by it: every lifecycle status that is neither decided (won / lost)
// nor expired.
const OPEN_STATUSES = new Set(OPEN_QUOTE_STATUSES);

// The bucket a quote counts in: "open" for every open status, otherwise the status itself
// ("won", "lost", "expired"). The status is the one Sales shows: a Quoted or Feedback quote whose
// validity has passed is "expired" and not open any more.
export function quoteBucket(quote: SalesQuote): string {
  return OPEN_STATUSES.has(quote.status) ? "open" : quote.status;
}

// Quotes are priced in their own currency, so their selling value is summed per currency, never
// across: "12,000 EUR · 3,000 USD" as `text`, empty when there is nothing to add up. Inside a
// quote, Sales converts the lines into the quote's currency; `sheet` is the current Exchange sheet
// it falls back on for quotes that store no rates. Lines no rate is known for are in no sum:
// `incomplete` then tells the view to say that its figure is short.
export function sellingByCurrency(quotes: SalesQuote[], sheet: ExchangeRates) {
  return sellingSum(quotes.map((quote) => computeTotals(quote.data, sheet)));
}
