"use client";

import { useMemo } from "react";
import { useFxRatesToday } from "@/hooks/useFx";
import type { QuoteFx } from "./types";

// Today's ČNB rates and company ROE % — what a quote not yet sent is priced with.
export function useQuoteFx(): QuoteFx | null {
  const { data } = useFxRatesToday();
  return useMemo(
    () =>
      data
        ? {
            date: data.date,
            fixingDate: data.fixingDate,
            roePct: data.roePct,
            rates: Object.fromEntries(data.rates.map((r) => [r.currency, r.rate])),
          }
        : null,
    [data],
  );
}
