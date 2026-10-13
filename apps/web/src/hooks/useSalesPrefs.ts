"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { asCompanyDetails, type CompanyDetails } from "@/app/sales/_lib/companyDetails";

interface SalesPrefOptions<T> {
  // For a screen that edits a value everybody shares: the value then counts as known only once it
  // was read after the screen opened, never from a remembered copy.
  fresh?: boolean;
  // Whether what is stored has the form the screen works with. What is stored is the whole
  // company's and may be from another version of the app - or not what it should be at all: a
  // value of another form is not used, and the screen gets the fallback instead.
  guard?: (stored: unknown) => stored is T;
}

// Generic persisted Sales UI preference (e.g. quote-history columns, saved views).
export const useSalesPref = <T,>(prefKey: string, fallback: T, opts?: SalesPrefOptions<T>) => {
  const queryClient = useQueryClient();
  const key = ["sales-pref", prefKey];
  const guard = opts?.guard;

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.sales.prefGet(prefKey),
    refetchOnMount: opts?.fresh ? "always" : true,
  });

  // The value a screen works with, out of what the server holds.
  const read = (stored: unknown): T => (stored === null || stored === undefined || (guard && !guard(stored)) ? fallback : (stored as T));

  // What was just stored is known without asking; the read after it only confirms it, and a
  // failure of that read must not bring the previous value back on screen.
  const remember = (value: T) => {
    queryClient.setQueryData(key, { value });
    return queryClient.invalidateQueries({ queryKey: key });
  };

  const setMutation = useMutation({
    mutationFn: (value: T) => api.sales.prefSet(prefKey, { value }),
    onSuccess: (_, value) => remember(value),
  });

  // For a value colleagues add to as well - a list of everybody's saved views: the copy this
  // screen read when it opened may lack what they stored since, and written back whole it would
  // erase that. So the stored value is read again right before writing and only the one change is
  // made to it. When that read fails nothing is written.
  const updateMutation = useMutation({
    mutationFn: async (change: (current: T) => T) => {
      const latest = await api.sales.prefGet(prefKey);
      const value = change(read(latest.value));
      await api.sales.prefSet(prefKey, { value });
      return value;
    },
    onSuccess: (value) => remember(value),
  });

  const value = read(query.data?.value);
  // "ready" once the stored value is known. Until then `value` is only the fallback, and it stays
  // the fallback when the first read fails ("error") - it must not be saved over what is stored.
  // With `fresh` a remembered copy is not knowing: a colleague may have stored something since, so
  // the value is "loading" until it was read again and "error" when that read failed - saved from
  // the old copy, its blanks would replace what the colleague stored.
  const failed = opts?.fresh ? query.isError : query.isLoadingError;
  const known = query.data !== undefined && (!opts?.fresh || query.isFetchedAfterMount);
  const status: "loading" | "ready" | "error" = failed ? "error" : known ? "ready" : "loading";

  return {
    value,
    status,
    reload: query.refetch,
    // Stores the value in place of what is stored. Rejects when the server did not take it.
    setValue: setMutation.mutateAsync,
    // Stores what `change` makes of the value as it is stored right now, and resolves with it.
    // Rejects, with nothing written, when the value could not be read or the server did not take it.
    update: updateMutation.mutateAsync,
  };
};

// Who quotations are from. Sales preferences are stored per company, so this is one value for
// everybody in it. The card that edits it asks for `fresh`; a document is printed with the copy
// at hand, which a failed refresh in the background must not block.
export const useCompanyDetails = (opts?: { fresh?: boolean }) => {
  const { value, status, reload, setValue } = useSalesPref<unknown>("company_details", null, opts);
  return useMemo(
    () => ({ status, details: asCompanyDetails(value), reload, save: (details: CompanyDetails) => setValue(details) }),
    [value, status, reload, setValue],
  );
};
