"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers } from "@/lib/api/client";
import { FX_KEYS } from "@/hooks/useFx";

// ČNB monthly averages (mean of the month's fixing days, no ROE %) — the fixed rates reports
// use. Month (YYYY-MM) → currency → CZK per 1 unit; `final` false for a month still running.
// `isError`: a year's averages could not be read, so a month without one may only not have been
// read - a report must not take that for "ČNB has no average"; `reload` asks for them again.
export interface PeriodAverages {
  rates: Map<string, Record<string, number>>;
  final: Map<string, boolean>;
  loading: boolean;
  isError: boolean;
  reload: () => void;
}

/** What the years' answers hold, month by month: one year's answer as react-query has it. */
export function periodAveragesOf(years: { data?: controllers.AveragesResponse; isLoading: boolean; isError: boolean }[]): Omit<PeriodAverages, "reload"> {
  const rates = new Map<string, Record<string, number>>();
  const final = new Map<string, boolean>();
  for (const r of years) {
    for (const p of r.data?.periods ?? []) {
      if (p.type !== "month") continue;
      rates.set(p.key, Object.fromEntries(p.averages.map((a) => [a.currency, a.average])));
      final.set(p.key, p.final);
    }
  }
  // A year read before keeps its averages when reading it again fails.
  return { rates, final, loading: years.some((r) => r.isLoading), isError: years.some((r) => r.isError && !r.data) };
}

export function usePeriodAverages(years: number[]): PeriodAverages {
  const unique = [...new Set(years)].sort();
  const results = useQueries({
    queries: unique.map((year) => ({
      queryKey: FX_KEYS.averages(year, true),
      queryFn: () => api.fx.fxAverages({ year, all: true }),
      staleTime: 10 * 60 * 1000,
    })),
  });
  // Rebuilt only when a year's data or its state actually changes, so callers can memoise on it.
  const version = results.map((r) => `${r.dataUpdatedAt}:${r.status}:${r.isLoading}`).join("|");
  return useMemo(
    () => ({
      ...periodAveragesOf(results),
      reload: () => {
        for (const r of results) if (r.isError) void r.refetch();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` tracks every year's data and state
    [version],
  );
}

// An amount in `currency` to CZK at the average of `month`; null when that average is missing.
export function toCzkAt(amount: number, currency: string, month: string, avg: PeriodAverages): number | null {
  if (!amount) return 0;
  const cur = (currency || "EUR").toUpperCase();
  if (cur === "CZK") return amount;
  const r = avg.rates.get(month)?.[cur];
  return r ? amount * r : null;
}
