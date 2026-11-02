import { APIError } from "encore.dev/api";

const MAX_SECONDARY_CURRENCIES = 2;

/**
 * A customer's default and secondary currencies as stored: codes upper-case, the secondary ones
 * without duplicates and without the default (a secondary made the default leaves the list).
 */
export function billingCurrencies(currencyRaw: string, secondaryRaw: string[]): { currency: string; secondaryCurrencies: string[] } {
  const code = (c: string) => {
    const v = c.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(v)) throw APIError.invalidArgument(`"${c}" is not a currency code`);
    return v;
  };
  const currency = code(currencyRaw);
  const secondaryCurrencies = [...new Set(secondaryRaw.map(code))].filter((c) => c !== currency);
  if (secondaryCurrencies.length > MAX_SECONDARY_CURRENCIES) {
    throw APIError.invalidArgument(`A customer can have at most ${MAX_SECONDARY_CURRENCIES} secondary currencies`);
  }
  return { currency, secondaryCurrencies };
}
