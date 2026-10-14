"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, clientForBody } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";

export type TermsConditionItem = interfaces.TermsConditionItem;

const TERMS_KEY = ["terms-conditions"];

// One list for "none yet": a new one with every render would look like new templates to whoever
// follows the list.
const NO_TERMS: TermsConditionItem[] = [];

export const useTermsConditions = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: TERMS_KEY,
    queryFn: () => api.sales.termsList(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: TERMS_KEY });

  const createMutation = useMutation({
    mutationFn: (name: string) => api.sales.termsCreate({ name }),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, params }: { id: string; params: controllers.TermsUpdateRequest }) => {
      // Measured in bytes, as the browser counts: a Czech letter takes two.
      // A template change on its way when the tab closes still arrives (keepalive, when it fits).
      return clientForBody(params).sales.termsUpdate(id, params);
    },
    onSuccess: ({ terms }) => {
      // The answer is the template as it is stored now: the list shows it at once. The list is
      // read again behind that - for its order by name, and for what colleagues changed - but
      // not waited for: whoever saved has the answer, and the next save must not queue behind
      // a read.
      queryClient.setQueryData<controllers.TermsListResponse>(TERMS_KEY, (list) => list && { ...list, data: list.data.map((t) => (t.id === terms.id ? terms : t)) });
      void invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.sales.termsDelete(id),
    onSuccess: invalidate,
  });

  return {
    terms: query.data?.data ?? NO_TERMS,
    isLoading: query.isLoading,
    // Reads the list again and resolves with what the read gave.
    reload: query.refetch,
    createTerms: createMutation.mutateAsync,
    updateTerms: updateMutation.mutateAsync,
    deleteTerms: deleteMutation.mutateAsync,
  };
};
