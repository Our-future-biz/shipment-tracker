"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** What a user can store for the Customer Database list (the customers service, not the shipment preferences). */
export type CustomerListPrefKey = "columns" | "filter-templates" | "column-templates";

/**
 * One saved setting of the Customer Database list for the signed-in user, kept in the customers service.
 * `guard` checks the stored value has the form the list works with; anything else gives the fallback.
 * A save shows at once and is put back if it fails.
 */
export function useCustomerListPref<T>(prefKey: CustomerListPrefKey, fallback: T, guard: (stored: unknown) => stored is T) {
  const queryClient = useQueryClient();
  const queryKey = ["customer-list-pref", prefKey];

  const query = useQuery({
    queryKey,
    queryFn: () => api.customers.customerListPrefGet(prefKey),
    staleTime: 5 * 60 * 1000,
  });

  let value = fallback;
  if (query.data?.value) {
    try {
      const parsed: unknown = JSON.parse(query.data.value);
      if (guard(parsed)) value = parsed;
    } catch {
      // A value that is not JSON is not used.
    }
  }

  const mutation = useMutation({
    mutationFn: ({ next }: { next: T; previous: unknown }) => api.customers.customerListPrefSet(prefKey, { value: JSON.stringify(next) }),
    onError: (_err, { previous }) => queryClient.setQueryData(queryKey, previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  // The new value is in place at once, before the request goes out, so a second change right after builds on it.
  const save = (next: T) => {
    void queryClient.cancelQueries({ queryKey });
    const previous = queryClient.getQueryData(queryKey);
    queryClient.setQueryData(queryKey, { value: JSON.stringify(next) });
    return mutation.mutateAsync({ next, previous });
  };

  return {
    value,
    // Known once the stored value has been read (or found missing); until then `value` is only the fallback.
    loaded: query.isSuccess,
    save,
    isSaving: mutation.isPending,
  };
}
