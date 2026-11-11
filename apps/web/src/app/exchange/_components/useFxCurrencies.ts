"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/lib/toast";
import { api } from "@/lib/api";
import { fxOverviewKey } from "@/hooks/useFx";

// The currencies each user picks to see on the Exchange rates page, and the one they are shown
// against, saved on the user so the choice follows them to another computer. Stored as
// { "currencies": ["EUR", "USD", ...], "base": "EUR" } with the list in their order; nothing
// saved (or an empty list) means the default EUR and USD, no base means CZK as ČNB publishes.
// The server reads the saved choice for the page (fx overview); this keeps what is changed here.
const PREF_KEY = "fx-currencies";

/** The cards show the first this many of the list; the popup shows all of it. */
export const CARD_CURRENCIES = 3;

export interface FxCurrencyChoice {
  currencies: string[];
  base: string;
}

/**
 * The choice with `base` as its base. The old base was hidden from the list while it was the base
 * (and may have been dropped from it by an edit then): it comes back first, rather than going missing.
 */
export function withBase(choice: FxCurrencyChoice, base: string): FxCurrencyChoice {
  const old = choice.base;
  const back = old !== "CZK" && old !== base && !choice.currencies.includes(old);
  return { base, currencies: back ? [old, ...choice.currencies] : choice.currencies };
}

export function useFxCurrencies() {
  const toast = useToast();
  const queryClient = useQueryClient();
  // The choice made on the page, ahead of its save; null until the user changes it.
  const [changed, setChanged] = useState<FxCurrencyChoice | null>(null);

  const save = useMutation({
    mutationFn: (next: FxCurrencyChoice) => api.shipments.userPrefSet(PREF_KEY, { value: JSON.stringify(next) }),
    // The page opened again starts from the saved choice (its own cache entry, kept for a minute): it gets
    // the rates of the choice just saved, and is read again then, never showing the choice from before.
    onSuccess: (_res, next) => {
      const savedKey = fxOverviewKey(null);
      const shown = queryClient.getQueryData(fxOverviewKey(next));
      if (shown) queryClient.setQueryData(savedKey, shown);
      void queryClient.invalidateQueries({ queryKey: savedKey, exact: true });
    },
    // Shown at once, so two quick clicks build on each other instead of the second undoing the first.
    onMutate: (next: FxCurrencyChoice) => {
      const previous = changed;
      setChanged(next);
      return { previous };
    },
    onError: (_e, _next, context) => {
      setChanged(context?.previous ?? null);
      toast.error("Could not save your currencies");
    },
  });

  return { changed, save: (next: FxCurrencyChoice) => save.mutate(next) };
}
