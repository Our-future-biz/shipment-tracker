"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/lib/toast";
import { api } from "@/lib/api";

// The currencies each user picks to see on the Exchange rates page, saved on the user so
// the choice follows them to another computer. Stored as { "currencies": ["EUR", "USD", ...] }
// in their order; nothing saved (or an empty list) means the default EUR and USD.
const PREF_KEY = "fx-currencies";
const QUERY_KEY = ["user-prefs", PREF_KEY];

/** The cards show the first this many of the list; the popup shows all of it. */
export const CARD_CURRENCIES = 3;

function parse(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const list = (JSON.parse(value) as { currencies?: unknown })?.currencies;
    return Array.isArray(list) ? list.filter((c): c is string => typeof c === "string" && /^[A-Z]{3}$/.test(c)) : [];
  } catch {
    return [];
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
    mutationFn: (next: string[]) => api.shipments.userPrefSet(PREF_KEY, { value: JSON.stringify({ currencies: next }) }),
    // Into the cache at once, so two quick clicks build on each other instead of the second undoing the first.
    onMutate: (next: string[]) => {
      const previous = queryClient.getQueryData(QUERY_KEY);
      queryClient.setQueryData(QUERY_KEY, { value: JSON.stringify({ currencies: next }) });
      return { previous };
    },
    onError: (_e, _next, context) => {
      queryClient.setQueryData(QUERY_KEY, context?.previous);
      toast.error("Could not save your currencies");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  // A failed load counts as known (the default list), so the page still shows.
  return { saved, ready: !isPending, save: (next: string[]) => save.mutate(next) };
}
