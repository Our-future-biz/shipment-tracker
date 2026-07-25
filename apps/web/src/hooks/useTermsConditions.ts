"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";

export type TermsConditionItem = interfaces.TermsConditionItem;

export const useTermsConditions = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["terms-conditions"],
    queryFn: () => api.sales.termsList(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["terms-conditions"] });

  const createMutation = useMutation({
    mutationFn: (name: string) => api.sales.termsCreate({ name }),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, params }: { id: string; params: controllers.TermsUpdateRequest }) =>
      api.sales.termsUpdate(id, params),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.sales.termsDelete(id),
    onSuccess: invalidate,
  });

  return {
    terms: query.data?.data ?? [],
    isLoading: query.isLoading,
    createTerms: createMutation.mutateAsync,
    updateTerms: updateMutation.mutateAsync,
    deleteTerms: deleteMutation.mutateAsync,
  };
};
