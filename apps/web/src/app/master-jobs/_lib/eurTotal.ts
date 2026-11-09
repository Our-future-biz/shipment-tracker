import { convert, type Rates } from "@/lib/fx";
import { roundCents } from "@/lib/money";

export interface EurTotal {
  /** The amounts added up in EUR; null when one has no ČNB rate. */
  eur: number | null;
  /** Currencies ČNB gave no rate for. */
  missing: string[];
}

/** Amounts in their own currencies as one sum in EUR, at the ČNB rates given (no ROE %). */
export function eurTotal(amounts: readonly (readonly [currency: string, amount: number])[], rates: Rates): EurTotal {
  let sum = 0;
  const missing = new Set<string>();
  for (const [currency, amount] of amounts) {
    const eur = convert(amount, currency, "EUR", rates);
    if (eur === null) missing.add(currency);
    else sum += eur;
  }
  return { eur: missing.size ? null : roundCents(sum), missing: [...missing].sort() };
}
