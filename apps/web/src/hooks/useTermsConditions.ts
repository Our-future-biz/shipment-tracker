"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";

export type TermsConditionItem = interfaces.TermsConditionItem;

const TERMS_KEY = ["terms-conditions"];

// One list for "none yet": a new one with every render would look like new templates to whoever
// follows the list.
const NO_TERMS: TermsConditionItem[] = [];

// The same client, except that its requests outlive the page (fetch keepalive), as a quote is
// saved (useSalesQuoteDraft): a template change that is on its way when the tab closes still
// arrives. Browsers take such a request only with a small body, so a longer text is saved the
// ordinary way.
const keepaliveApi = api.with({ requestInit: { keepalive: true } });
const KEEPALIVE_MAX_BYTES = 60 * 1024;

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
      const outlivesPage = new Blob([JSON.stringify(params)]).size <= KEEPALIVE_MAX_BYTES;
      return (outlivesPage ? keepaliveApi : api).sales.termsUpdate(id, params);
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
