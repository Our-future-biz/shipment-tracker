"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { exchangeRatesFor } from "@/lib/exchangeRates";

// The Exchange sheet's rates of the current week, picked by the rule shipment costs use for their
// ETA/ETD week. Sales converts quote lines with them wherever a quote stores no rate of its own.
export const useCurrentExchangeRates = () => {
  // Same key and freshness as the shipment costs, so both read one copy of the sheet.
  const query = useQuery({
    queryKey: ["exchange-rates"],
    queryFn: () => api.invoicing.exchangeRateList(),
    staleTime: 10 * 60 * 1000,
  });

  // The same day the Exchange page calls "current".
  const today = new Date().toISOString().slice(0, 10);

  return useMemo(
    () => ({
      ...exchangeRatesFor(query.data?.rates ?? [], today),
      isLoading: query.isLoading,
      // The sheet could not be read. `rates` then knows only CZK, exactly as with an empty sheet,
      // but the two are not the same: a rate that did not arrive must not be reported as one that
      // nobody entered - the user would be told to type a rate the sheet has.
      isError: query.isLoadingError,
      reload: query.refetch,
    }),
    [query.data?.rates, today, query.isLoading, query.isLoadingError, query.refetch],
  );
};

export type CurrentExchangeRates = ReturnType<typeof useCurrentExchangeRates>;
