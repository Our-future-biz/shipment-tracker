"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers } from "@/lib/api/client";

export const useQuotes = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["quotes"],
    queryFn: () => api.quotes.quoteList({ limit: 200 }),
  });

  const createMutation = useMutation({
    mutationFn: (params: controllers.QuoteCreateRequest) => api.quotes.quoteCreate(params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotes"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (quoteNumber: string) => api.quotes.quoteDelete(quoteNumber),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotes"] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ quoteNumber, params }: { quoteNumber: string; params: controllers.QuoteUpdateRequest }) => api.quotes.quoteUpdate(quoteNumber, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotes"] }),
  });

  return {
    quotes: query.data?.data ?? [],
    isLoading: query.isLoading,
    createQuote: createMutation.mutateAsync,
    deleteQuote: deleteMutation.mutateAsync,
    updateQuote: updateMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
};
