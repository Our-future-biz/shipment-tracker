import { roundCents } from "@/lib/money";

// The customer's statement (Finance → Accounts Receivable, step 7): one per currency the customer owes in, made by the
// server from the invoices issued in Invoicing that are still left to pay. It is downloaded and e-mailed from
// Accounts Receivable's StatementMenu, here as on the Accounts Receivable page.

/** The currencies the customer owes in, as Accounts Receivable reads its invoices: something left to pay. */
export function statementCurrencies(rows: readonly { currency: string; leftToPay: number; status: string }[]): string[] {
  const owed = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== "unpaid" && r.status !== "part_paid") continue;
    owed.set(r.currency, (owed.get(r.currency) ?? 0) + r.leftToPay);
  }
  return [...owed]
    .filter(([, amount]) => roundCents(amount) > 0)
    .map(([currency]) => currency)
    .sort();
}
