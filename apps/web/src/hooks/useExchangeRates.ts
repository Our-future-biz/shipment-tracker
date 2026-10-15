"use client";

import { useMemo } from "react";
import { useFxRatesToday } from "@/hooks/useFx";
import type { ExchangeRates } from "@/lib/exchangeRates";

// Today's ČNB rates (CZK per 1 unit), for converting quote lines wherever a quote stores no rate
// of its own. The weekly Exchange sheet this used to read is retired; ČNB is the only source.
/** exact: today's fixing; older: an earlier fixing stands in (weekend, holiday, not yet published); none: no rates. */
export type FxSource = "exact" | "older" | "none";

const fxSourceOf = (data: { rates: unknown[]; fixingDate: string | null; date: string } | undefined): FxSource => {
  if (!data || data.rates.length === 0) return "none";
  return data.fixingDate === data.date ? "exact" : "older";
};

export const useCurrentExchangeRates = () => {
  const query = useFxRatesToday();
  const data = query.data;

  return useMemo(() => {
    const rates: ExchangeRates = {
      CZK: 1,
      ...Object.fromEntries((data?.rates ?? []).filter((r) => r.rate > 0).map((r) => [r.currency, r.rate])),
    };
    const fixingDate = data?.fixingDate ?? "";
    return {
      rates,
      /** The ČNB fixing the rates come from (YYYY-MM-DD); "" until loaded. */
      fixingDate,
      /** Company ROE % a draft's selling lines in another currency carry (100 = pure ČNB). */
      roePct: data?.roePct ?? 100,
      source: fxSourceOf(data),
      /** A fixing that should exist was never imported: the rates are stale, not just older. */
      missing: !!data?.missing,
      isLoading: query.isLoading,
      // The rates could not be read. `rates` then knows only CZK, but that is not the same as no
      // rate existing: the user must not be told to type a rate ČNB has.
      isError: query.isLoadingError,
      reload: query.refetch,
    };
  }, [data, query.isLoading, query.isLoadingError, query.refetch]);
};

export type CurrentExchangeRates = ReturnType<typeof useCurrentExchangeRates>;
