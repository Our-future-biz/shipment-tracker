"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// Generic persisted Sales UI preference (e.g. quote-history columns, saved views).
export const useSalesPref = <T,>(prefKey: string, fallback: T) => {
  const queryClient = useQueryClient();
  const key = ["sales-pref", prefKey];

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.sales.prefGet(prefKey),
  });

  const setMutation = useMutation({
    mutationFn: (value: T) => api.sales.prefSet(prefKey, { value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const value = (query.data?.value as T | null | undefined) ?? fallback;

  return {
    value,
    isLoading: query.isLoading,
    setValue: setMutation.mutateAsync,
  };
};
