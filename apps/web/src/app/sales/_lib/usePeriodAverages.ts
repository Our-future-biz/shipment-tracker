"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { FX_KEYS } from "@/hooks/useFx";

// ČNB monthly averages (mean of the month's fixing days, no ROE %) — the fixed rates reports
// use. Month (YYYY-MM) → currency → CZK per 1 unit; `final` false for a month still running.
export interface PeriodAverages {
  rates: Map<string, Record<string, number>>;
  final: Map<string, boolean>;
  loading: boolean;
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
  // Rebuilt only when a year's data actually changes, so callers can memoise on it.
  const version = results.map((r) => r.dataUpdatedAt).join("|");
  const loading = results.some((r) => r.isLoading);
  return useMemo(() => {
    const rates = new Map<string, Record<string, number>>();
    const final = new Map<string, boolean>();
    for (const r of results) {
      for (const p of r.data?.periods ?? []) {
        if (p.type !== "month") continue;
        rates.set(p.key, Object.fromEntries(p.averages.map((a) => [a.currency, a.average])));
        final.set(p.key, p.final);
      }
    }
    return { rates, final, loading };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` tracks every year's data
  }, [version, loading]);
}

// An amount in `currency` to CZK at the average of `month`; null when that average is missing.
export function toCzkAt(amount: number, currency: string, month: string, avg: PeriodAverages): number | null {
  if (!amount) return 0;
  const cur = (currency || "EUR").toUpperCase();
  if (cur === "CZK") return amount;
  const r = avg.rates.get(month)?.[cur];
  return r ? amount * r : null;
}
