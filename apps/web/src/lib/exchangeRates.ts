import type { interfaces } from "@/lib/api/client";
import { weekKeyFromDate } from "@/lib/isoWeek";

// Reading the Exchange sheet: weekly rows of CZK per 1 EUR and CZK per 1 USD. Shipment costs and
// sales quotes both convert through CZK with these rates, so both pick the week by this one rule.

/** CZK per 1 unit of a currency. CZK itself is 1; a currency without a rate is absent - never 1. */
export type ExchangeRates = Record<string, number>;

/** Without a rate sheet only CZK is known. */
const CZK_ONLY: ExchangeRates = { CZK: 1 };

export interface WeekRates {
  rates: ExchangeRates;
  /** exact: the week of the date has its own row. older: it has none, another row stands in. none: the sheet is empty. */
  source: "exact" | "older" | "none";
  /** The week the rates were entered for; empty when there are none. */
  usedWeek: string;
}

/** Rates of the week `date` (YYYY-MM-DD) falls in; the closest older week when that one is missing. */
export function exchangeRatesFor(list: interfaces.ExchangeRateItem[], date: string): WeekRates {
  const weekKey = date ? weekKeyFromDate(date) : "";
  const exact = list.find((r) => r.week === weekKey);
  // the list comes newest first, so the first older week is the closest one
  const row = exact ?? (date ? list.find((r) => r.validFrom <= date) : list[0]) ?? list[0];
  if (!row) return { rates: CZK_ONLY, source: "none", usedWeek: "" };

  const eur = Number(row.rateEur);
  const usd = Number(row.rateUsd);
  return {
    rates: {
      CZK: 1,
      ...(Number.isFinite(eur) && eur > 0 ? { EUR: eur } : {}),
      ...(Number.isFinite(usd) && usd > 0 ? { USD: usd } : {}),
    },
    source: exact ? "exact" : "older",
    usedWeek: row.week,
  };
}
