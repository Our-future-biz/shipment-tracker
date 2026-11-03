import type { QuoteRates } from "../lib/quoteMargin";
import { isPlainObject } from "./quoteDocument.utils";

// Pure parts of the Sales managers' facts (services/managersFacts.service), tested in
// tests/managersFacts.utils.test.ts.

/** What a customer owes, as the customers service tells it. */
export interface CreditFacts {
  creditLimit: number;
  currency: string;
  unpaid: { currency: string; amount: number }[];
  overdueCount: number;
  oldestOverdueDue: string | null;
}

/** How far a customer's unpaid invoices exceed its credit limit, in CZK at today's rates; null when they don't (or no limit is set). */
export function overLimitCzk(c: CreditFacts, sheet: QuoteRates): number | null {
  if (!(c.creditLimit > 0)) return null;
  const czk = (currency: string) => (currency === "CZK" ? 1 : (sheet.rates[currency] ?? null));
  const limitRate = czk(c.currency);
  if (limitRate === null) return null;
  // A currency with no rate today is left out: the figure is then a lower bound.
  const owed = c.unpaid.reduce((sum, u) => sum + u.amount * (czk(u.currency) ?? 0), 0);
  const over = owed - c.creditLimit * limitRate;
  return over > 0 ? Math.round(over) : null;
}

/**
 * When the quote got the status it has now: the last status line of its history, else its
 * creation - also when that line's moment is no date (a browser wrote the history once).
 */
export function statusSinceOf(data: Record<string, unknown>, createdAt: Date): string {
  const timeline = Array.isArray(data.timeline) ? data.timeline : [];
  for (let i = timeline.length - 1; i >= 0; i--) {
    const e = timeline[i];
    if (isPlainObject(e) && (e.kind === undefined || e.kind === "status") && typeof e.status === "string") {
      const at = typeof e.at === "string" ? Date.parse(e.at) : NaN;
      return Number.isFinite(at) ? new Date(at).toISOString() : createdAt.toISOString();
    }
  }
  return createdAt.toISOString();
}

/** The middle of the figures (the mean of the middle two), rounded; null for none. */
export const median = (values: number[]) => {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : Math.round((v[mid - 1]! + v[mid]!) / 2);
};
