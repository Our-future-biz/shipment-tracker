"use client";

import { useMemo } from "react";
import { useFxRatesToday } from "@/hooks/useFx";

/**
 * Today's ČNB rates (CZK per 1 unit; CZK itself is 1), for showing amounts in other
 * currencies across the app. Invoices themselves use the ČNB rate of their DUZP (on the
 * server); this is "today's" picture.
 */

export type Rates = Record<string, number>;

/** Converts between currencies through CZK; null when either side has no rate. */
export function convert(amount: number, from: string, to: string, rates: Rates): number | null {
  const f = !from || from === "CZK" ? 1 : rates[from];
  const t = !to || to === "CZK" ? 1 : rates[to];
  if (!f || !t) return null;
  return (amount * f) / t;
}

/** Today's ČNB rates (the same query quotes use). `fixingLabel` names the fixing used. */
export function useLatestRates() {
  const { data, isLoading } = useFxRatesToday();
  const rates = useMemo<Rates>(
    () => ({ CZK: 1, ...Object.fromEntries((data?.rates ?? []).map((r) => [r.currency, r.rate])) }),
    [data?.rates],
  );
  const fixing = data?.fixingDate ? `ČNB ${data.fixingDate.split("-").reverse().join(".")}` : "";
  return { rates, fixingLabel: fixing, isLoading };
}
