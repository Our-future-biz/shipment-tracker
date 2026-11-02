// The currencies a user picked to see on the Exchange rates page and the one they are shown
// against, saved on the user (shipments' user preferences, key "fx-currencies") as
// { "currencies": ["EUR", "USD", ...], "base": "EUR" }: the list in their order. Nothing saved, or
// an empty list, means the default EUR and USD; no base means CZK, as ČNB publishes.

export const FX_CHOICE_PREF_KEY = "fx-currencies";

/** A user's saved choice of currencies, read. */
export interface CurrencyChoice {
  currencies: string[];
  base: string;
}

const isCode = (c: unknown): c is string => typeof c === "string" && /^[A-Z]{3}$/.test(c);

/** The saved choice from the stored text; whatever is not a currency code is left out. */
export function parseCurrencyChoice(value: string | null | undefined): CurrencyChoice {
  try {
    const parsed = (value ? JSON.parse(value) : {}) as { currencies?: unknown; base?: unknown } | null;
    return {
      currencies: Array.isArray(parsed?.currencies) ? parsed.currencies.filter(isCode) : [],
      base: isCode(parsed?.base) ? parsed.base : "CZK",
    };
  } catch {
    return { currencies: [], base: "CZK" };
  }
}
