// Customs invoice lines and their totals per currency. Amounts are read and shown with lib/money,
// by the same rules as every other amount in the app.

export interface CustomsInvoiceLine {
  category: string;
  currency: string;
  value: number;
}

// The lines add up per currency, in the order the currencies first appear.
export function totalsByCurrency(lines: CustomsInvoiceLine[]): [string, number][] {
  const sums = new Map<string, number>();
  for (const l of lines) sums.set(l.currency, (sums.get(l.currency) ?? 0) + l.value);
  return [...sums.entries()];
}
