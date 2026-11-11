/**
 * What the job's Buying / Selling / Profit can show. Until the job's ČNB rates are in (or when they
 * could not be loaded) only CZK is known, so a row in another currency - or every row, when the job
 * is billed in one - would be left out and the totals read 0.00 or a part of them:
 *  - wait: the job's rows, or the rates its rows need, are on the way
 *  - no-rates: the rates its rows need could not be loaded
 *  - ready: the totals, with the rows left out for a currency ČNB has no rate for (null when none)
 */
export type JobTotalsState =
  | { kind: "wait" }
  | { kind: "no-rates" }
  | { kind: "ready"; leftOut: { currencies: string[]; rows: number } | null };

export interface JobTotalsInput {
  costsLoaded: boolean;
  ratesLoading: boolean;
  ratesError: boolean;
  /** computeCosts' missingCurrencies and unconvertibleRowCount, worked out with the rates there are. */
  missingCurrencies: readonly string[];
  unconvertibleRowCount: number;
}

export function jobTotalsState({ costsLoaded, ratesLoading, ratesError, missingCurrencies, unconvertibleRowCount }: JobTotalsInput): JobTotalsState {
  if (!costsLoaded) return { kind: "wait" };
  // Nothing needs a rate that is not there (a job all in CZK): the totals are whole, rates or not.
  if (missingCurrencies.length === 0) return { kind: "ready", leftOut: null };
  if (ratesLoading) return { kind: "wait" };
  if (ratesError) return { kind: "no-rates" };
  return { kind: "ready", leftOut: { currencies: [...missingCurrencies], rows: unconvertibleRowCount } };
}

/** What a left-out mark says: "2 rows of the job are left out: ČNB publishes no rate for GBP." */
export function leftOutText({ currencies, rows }: { currencies: string[]; rows: number }): string {
  const list = currencies.join(", ");
  return rows > 0
    ? `${rows} row${rows === 1 ? "" : "s"} of the job ${rows === 1 ? "is" : "are"} left out: ČNB publishes no rate for ${list}.`
    : `ČNB publishes no rate for ${list}.`;
}
