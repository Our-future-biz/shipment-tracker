// Rates as CZK per 1 unit of a currency (one type for the whole app: lib/fx `Rates`). CZK itself
// is 1; a currency without a rate is absent - never 1. Today's are ČNB's fixing; a sent quote
// keeps its own snapshot.
export type { Rates as ExchangeRates } from "@/lib/fx";
