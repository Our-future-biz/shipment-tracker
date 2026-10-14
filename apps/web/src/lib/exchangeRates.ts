// Rates as CZK per 1 unit of a currency. CZK itself is 1; a currency without a rate is absent -
// never 1. Today's are ČNB's fixing (hooks/useExchangeRates); a sent quote keeps its own snapshot.
export type ExchangeRates = Record<string, number>;
