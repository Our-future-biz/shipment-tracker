"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { QuoteFx } from "./types";

// Today's ČNB rates and company ROE % — what a quote not yet sent is priced with.
export function useQuoteFx(): QuoteFx | null {
  const { data } = useQuery({
    queryKey: ["fx", "rates-today"],
    queryFn: () => api.fx.fxRatesOn({}),
    staleTime: 10 * 60 * 1000,
  });
  if (!data) return null;
  return {
    date: data.date,
    fixingDate: data.fixingDate,
    roePct: data.roePct,
    rates: Object.fromEntries(data.rates.map((r) => [r.currency, r.rate])),
  };
}
