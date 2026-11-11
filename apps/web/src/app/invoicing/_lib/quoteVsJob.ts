import { isSalesQuoteRef, lineValue, quoteProfitIn } from "@/app/sales/_lib/salesQuote";
import type { CostLine, SalesQuoteData } from "@/app/sales/_lib/types";
import { roundCents } from "@/lib/money";

/** CZK per 1 unit of a currency (the job's ČNB rates); CZK itself is 1. */
type Rates = Record<string, number>;

/**
 * The quote a job's profit is compared with: the one its costs were last copied from, else the
 * one its buying rows name, else the one its Sales Number names - as Costs Breakdown's Report
 * compares it. Null when there is none.
 */
export function profitQuoteRef(copiedFrom: string | null | undefined, buyingQuoteRefs: readonly string[], salesNumber: string | null | undefined): string | null {
  const copied = (copiedFrom ?? "").trim();
  const sales = (salesNumber ?? "").trim();
  return (isSalesQuoteRef(copied) ? copied : null) ?? buyingQuoteRefs.find((r) => r.trim()) ?? (isSalesQuoteRef(sales) ? sales : null);
}

/** How far the job's profit is from the profit its quote calculated, and why - in the job's billing currency. */
export interface QuoteVsJob {
  /** The profit the quote calculated: at its own rates, with its ROE on selling lines in another currency. */
  quoteProfit: number;
  /** The job's profit now minus the quote's. The three parts below add up to it. */
  difference: number;
  /** The quote's own lines valued at the job's rates, without ROE, minus the quote's profit. */
  ratesAndRoe: number;
  /** Real costs typed against the quote's estimates: what they cost more (below zero) or less. */
  realVsEstimate: number;
  /** The rest: rows added, changed, removed or unticked since the quote was copied. */
  otherRows: number;
  /** Currencies of quote lines the job has no rate for; those lines are left out of `ratesAndRoe`. */
  missingRates: string[];
}

/**
 * Splits the difference between the job's profit and its quote's into what moved it: the exchange
 * rates (and the ROE the quote counted), real costs against the estimates, and the rows that are
 * not the quote's any more. Nothing is recalculated: the quote's profit is its own figure, the
 * job's the Costs Breakdown one (`jobProfit`, at the job's rates, `rxeTotal` its Real - Estimated).
 * Null when the quote's profit cannot be put in the billing currency.
 */
export function quoteVsJob(
  quote: SalesQuoteData,
  job: { profit: number; rxeTotal: number; billingCurrency: string; rates: Rates },
): QuoteVsJob | null {
  const quoteProfit = quoteProfitIn(quote, job.rates, job.billingCurrency);
  if (quoteProfit === null) return null;

  const missing = new Set<string>();
  const rate = (currency: string): number | null => {
    if (!currency || currency === "CZK") return 1;
    const r = job.rates[currency];
    if (typeof r === "number" && Number.isFinite(r) && r > 0) return r;
    missing.add(currency);
    return null;
  };
  const billingRate = rate(job.billingCurrency);
  // Only the quote's own currencies are reported missing (the caller checks the billing currency).
  missing.delete(job.billingCurrency);
  const quoteCurrency = quote.currency || "EUR";
  // A line's value in the billing currency at the job's rates (no ROE); a line without a rate counts 0.
  const valued = (lines: CostLine[] | undefined) =>
    (lines ?? []).reduce((sum, line) => {
      const from = rate(line.currency || quoteCurrency);
      return from === null || billingRate === null ? sum : sum + (lineValue(line) * from) / billingRate;
    }, 0);
  const quoteAtJobRates = valued(quote.sellingLines) - valued(quote.buyingLines);

  const difference = roundCents(job.profit - quoteProfit);
  const ratesAndRoe = roundCents(quoteAtJobRates - quoteProfit);
  // A real cost above its estimate lowers the profit.
  const realVsEstimate = roundCents(-job.rxeTotal);
  return {
    quoteProfit: roundCents(quoteProfit),
    difference,
    ratesAndRoe,
    realVsEstimate,
    otherRows: roundCents(difference - ratesAndRoe - realVsEstimate),
    missingRates: [...missing].sort(),
  };
}
