"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Exchange rates from the Exchange page (CZK per 1 unit; CZK itself is 1), for showing
 * amounts in other currencies across the app. Invoices themselves use the rate of their
 * DUZP week (on the server); this is "today's" picture.
 */

export type Rates = Record<string, number>;

export interface RateRow {
  week: string;
  validFrom: string;
  validTo: string;
  rateEur: string | null;
  rateUsd: string | null;
}

/** The week containing `today`, else the closest older week, else the newest one. */
export function pickRates(rows: RateRow[], today: string): { rates: Rates; week: string } {
  if (!rows.length) return { rates: { CZK: 1 }, week: "" };
  const sorted = [...rows].sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  const row = sorted.find((r) => r.validFrom <= today && today <= r.validTo) ?? sorted.find((r) => r.validFrom <= today) ?? sorted[0]!;
  const rates: Rates = { CZK: 1 };
  const eur = Number(row.rateEur);
  const usd = Number(row.rateUsd);
  if (Number.isFinite(eur) && eur > 0) rates.EUR = eur;
  if (Number.isFinite(usd) && usd > 0) rates.USD = usd;
  return { rates, week: row.week };
}

/** Converts between currencies through CZK; null when either side has no rate. */
export function convert(amount: number, from: string, to: string, rates: Rates): number | null {
  const f = !from || from === "CZK" ? 1 : rates[from];
  const t = !to || to === "CZK" ? 1 : rates[to];
  if (!f || !t) return null;
  return (amount * f) / t;
}

/** Today's rates (same query key as the Costs tab and the Exchange page, so it is shared). */
export function useLatestRates() {
  const { data, isLoading } = useQuery({
    queryKey: ["exchange-rates"],
    queryFn: () => api.invoicing.exchangeRateList(),
    staleTime: 10 * 60 * 1000,
  });
  const today = new Date().toISOString().slice(0, 10);
  const picked = useMemo(() => pickRates(data?.rates ?? [], today), [data?.rates, today]);
  return { ...picked, isLoading };
}
