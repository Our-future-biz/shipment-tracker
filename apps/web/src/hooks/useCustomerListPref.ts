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

  const parse = (stored: { value?: string | null } | undefined): T => {
    if (!stored?.value) return fallback;
    try {
      const parsed: unknown = JSON.parse(stored.value);
      return guard(parsed) ? parsed : fallback;
    } catch {
      return fallback; // A value that is not JSON is not used.
    }
  };
  const value = parse(query.data);

  // A failed save puts back what the server holds (refetched), not a snapshot taken before some
  // earlier save, which would also undo a later change that did go through.
  const mutation = useMutation({
    mutationFn: (next: T) => api.customers.customerListPrefSet(prefKey, { value: JSON.stringify(next) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  // The new value is in place at once, before the request goes out, so a second change right after builds on it.
  const save = (next: T) => {
    void queryClient.cancelQueries({ queryKey });
    queryClient.setQueryData(queryKey, { value: JSON.stringify(next) });
    return mutation.mutateAsync(next);
  };

  // A change built on the value as the server holds it now (read again first), so a template
  // another tab saved meanwhile is kept, not overwritten by this tab's older list. Two saves at
  // the very same moment can still race; the last one wins.
  const update = async (change: (current: T) => T) => {
    const fresh = await queryClient.fetchQuery({ queryKey, queryFn: () => api.customers.customerListPrefGet(prefKey), staleTime: 0 });
    return save(change(parse(fresh)));
  };

  return {
    value,
    // Known once the stored value has been read (or found missing); until then `value` is only the fallback.
    loaded: query.isSuccess,
    save,
    update,
    isSaving: mutation.isPending,
  };
}
