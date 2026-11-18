import { formatAmount, round2 } from "@/lib/money";

// Money per currency for Finance's pages (Accounts Payable, Accounts Receivable): one figure per currency, never
// converted, never added into one grand total across currencies.

/** One amount in its own currency. */
export interface CurrencyAmount {
  currency: string;
  amount: number;
}

/** A list of amounts, one per currency. */
export type Amounts = CurrencyAmount[];

/** "1,200 EUR · 300 USD"; "—" for none. Never converted, never one grand total (D3, the page). */
export function amountsText(amounts: readonly CurrencyAmount[]): string {
  return amounts.length ? amounts.map((a) => formatAmount(a.amount, a.currency)).join(" · ") : "—";
}

/** Amounts per currency added up, largest first (as the server orders them). */
export function sumAmounts(lists: readonly (readonly CurrencyAmount[])[]): Amounts {
  const sums = new Map<string, number>();
  for (const list of lists) for (const a of list) sums.set(a.currency, round2((sums.get(a.currency) ?? 0) + a.amount));
  return [...sums.entries()].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.currency.localeCompare(b.currency));
}
