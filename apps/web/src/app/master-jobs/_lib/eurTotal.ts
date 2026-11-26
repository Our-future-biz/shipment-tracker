import { convert, type Rates } from "@/lib/fx";
import { roundCents } from "@/lib/money";

export interface EurTotal {
  /** The amounts added up in EUR; null when one has no ČNB rate. */
  eur: number | null;
  /** Currencies ČNB gave no rate for. */
  missing: string[];
}

/** Amounts in their own currencies as one sum in EUR, at the ČNB rates given (no ROE %). An amount of 0 needs no rate. */
export function eurTotal(amounts: readonly (readonly [currency: string, amount: number])[], rates: Rates): EurTotal {
  // A real cost of 0 in a currency without a rate adds nothing: it leaves no sum unknown.
  const counted = amounts.filter(([, amount]) => amount !== 0);
  // Every other currency goes to EUR through CZK: without the EUR rate, that is the one missing.
  if (!rates.EUR && counted.some(([currency]) => currency !== "EUR")) return { eur: null, missing: ["EUR"] };
  let sum = 0;
  const missing = new Set<string>();
  for (const [currency, amount] of counted) {
    const eur = currency === "EUR" ? amount : convert(amount, currency, "EUR", rates);
    if (eur === null) missing.add(currency);
    else sum += eur;
  }
  return { eur: missing.size ? null : roundCents(sum), missing: [...missing].sort() };
}
