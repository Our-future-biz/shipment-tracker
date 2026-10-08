import { computeTotals, fmt, validityInfo, type SalesQuote } from "@/app/sales/_lib/salesQuote";
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

// When a quote's validity ends. validityInfo throws on a quote whose stored send date is unreadable;
// one such quote must not take a whole list or table down with it.
export function safeValidityInfo(quote: SalesQuote): { date: string | null; expired: boolean } {
  try {
    return validityInfo(quote.data);
  } catch {
    return { date: null, expired: false };
  }
}

// The Sales status colours (QUOTE_STATUSES) as Tailwind classes, for the status pill.
export const QUOTE_STATUS_CLASS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-500",
  ready_to_send: "bg-indigo-100 text-indigo-600",
  quoted: "bg-blue-100 text-blue-700",
  feedback: "bg-amber-100 text-amber-600",
  revised: "bg-violet-100 text-violet-600",
  won: "bg-green-100 text-green-600",
  lost: "bg-red-100 text-red-600",
  expired: "bg-slate-100 text-slate-500",
};

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
