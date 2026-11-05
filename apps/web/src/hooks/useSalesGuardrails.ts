"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers } from "@/lib/api/client";
import { salesGuardrailKeys, salesManagersKeys } from "@/hooks/salesQueryKeys";
import { invalidateQuoteLists } from "@/hooks/useSalesQuotes";

export type GuardrailRow = controllers.GuardrailRow;

/**
 * Sales Settings → Guardrails: the margin floor of each freight mode, and the save of those who
 * manage Sales. Every quote is judged by them, so a save also makes the lists of quotes (what may
 * be sent, the margins) and the managers' cockpit (below the floor, approvals that no longer
 * cover) out of date.
 */
export const useSalesGuardrails = () => {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: salesGuardrailKeys.all, queryFn: () => api.quotes.salesGuardrailsGet() });
  const save = useMutation({
    mutationFn: (rows: { serviceType: string; percent: number; minAmountCzk: number }[]) => api.quotes.salesGuardrailsSet({ guardrails: rows }),
    onSuccess: (data) => {
      queryClient.setQueryData(salesGuardrailKeys.all, data);
      void invalidateQuoteLists(queryClient);
      void queryClient.invalidateQueries({ queryKey: salesManagersKeys.cockpit });
    },
  });
  return {
    guardrails: query.data ?? null,
    isLoading: query.isLoading,
    reload: query.refetch,
    save,
  };
};
