"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/lib/toast";
import { api } from "@/lib/api";

// The currencies each user picks to see on the Exchange rates page, and the one they are shown
// against, saved on the user so the choice follows them to another computer. Stored as
// { "currencies": ["EUR", "USD", ...], "base": "EUR" } with the list in their order; nothing
// saved (or an empty list) means the default EUR and USD, no base means CZK as ČNB publishes.
const PREF_KEY = "fx-currencies";
const QUERY_KEY = ["user-prefs", PREF_KEY];

/** The cards show the first this many of the list; the popup shows all of it. */
export const CARD_CURRENCIES = 3;

export interface FxCurrencyChoice {
  currencies: string[];
  base: string;
}

const isCode = (c: unknown): c is string => typeof c === "string" && /^[A-Z]{3}$/.test(c);

function parse(value: string | null | undefined): FxCurrencyChoice {
  try {
    const parsed = (value ? JSON.parse(value) : {}) as { currencies?: unknown; base?: unknown };
    return {
      currencies: Array.isArray(parsed?.currencies) ? parsed.currencies.filter(isCode) : [],
      base: isCode(parsed?.base) ? parsed.base : "CZK",
    };
  } catch {
    return { currencies: [], base: "CZK" };
  }
}

export function useFxCurrencies() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => api.shipments.userPrefGet(PREF_KEY),
    staleTime: 5 * 60 * 1000,
  });
  const saved = useMemo(() => parse(data?.value), [data?.value]);

  const save = useMutation({
    mutationFn: (next: FxCurrencyChoice) => api.shipments.userPrefSet(PREF_KEY, { value: JSON.stringify(next) }),
    // Into the cache at once, so two quick clicks build on each other instead of the second undoing the first.
    onMutate: (next: FxCurrencyChoice) => {
      const previous = queryClient.getQueryData(QUERY_KEY);
      queryClient.setQueryData(QUERY_KEY, { value: JSON.stringify(next) });
      return { previous };
    },
    onError: (_e, _next, context) => {
      queryClient.setQueryData(QUERY_KEY, context?.previous);
      toast.error("Could not save your currencies");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  // A failed load counts as known (the default list), so the page still shows.
  return {
    saved: saved.currencies,
    base: saved.base,
    ready: !isPending,
    saveList: (currencies: string[]) => save.mutate({ ...saved, currencies }),
    // The old base was hidden from the list while it was the base (and may have been dropped
    // from it by an edit then): it comes back first, rather than going missing.
    saveBase: (base: string) => {
      const old = saved.base;
      const back = old !== "CZK" && old !== base && !saved.currencies.includes(old);
      save.mutate({ base, currencies: back ? [old, ...saved.currencies] : saved.currencies });
    },
  };
}
