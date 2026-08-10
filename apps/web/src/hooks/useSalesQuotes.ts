"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SalesQuoteData } from "@/app/sales/_lib/types";
import { toSalesQuote, isSalesQuote, asData, type SalesQuote } from "@/app/sales/_lib/salesQuote";

export const useSalesQuotes = (opts?: { refetchInterval?: number }) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["quotes"],
    queryFn: () => api.quotes.quoteList({ limit: 500 }),
    refetchInterval: opts?.refetchInterval,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["quotes"] });

  const salesQuotes: SalesQuote[] = useMemo(
    () => (query.data?.data ?? []).filter(isSalesQuote).map(toSalesQuote),
    [query.data],
  );

  const createMutation = useMutation({
    mutationFn: async (initial: SalesQuoteData) => {
      const { ref } = await api.quotes.quoteNextRef();
      const data: SalesQuoteData = { reference: ref, quoteStatus: "draft", winProbability: 10, method: "manual", ...initial };
      await api.quotes.quoteCreate({ quoteNumber: ref, data });
      return ref;
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ quoteNumber, data }: { quoteNumber: string; data: SalesQuoteData }) =>
      api.quotes.quoteUpdate(quoteNumber, { data }),
    onSuccess: invalidate,
  });

  const duplicateMutation = useMutation({
    mutationFn: async ({ baseRef, data }: { baseRef: string; data: SalesQuoteData }) => {
      const res = await api.quotes.quoteDuplicate({ baseRef, data });
      return res.quoteNumber;
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (quoteNumber: string) => api.quotes.quoteDelete(quoteNumber),
    onSuccess: invalidate,
  });

  return {
    salesQuotes,
    rawQuotes: query.data?.data ?? [],
    isLoading: query.isLoading,
    createQuote: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateQuoteData: updateMutation.mutateAsync,
    duplicateQuote: duplicateMutation.mutateAsync,
    deleteQuote: deleteMutation.mutateAsync,
  };
};

export const useSalesQuote = (quoteNumber: string | null) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["quote", quoteNumber],
    queryFn: () => api.quotes.quoteGet(quoteNumber as string),
    enabled: !!quoteNumber,
  });

  const updateMutation = useMutation({
    mutationFn: (data: SalesQuoteData) => api.quotes.quoteUpdate(quoteNumber as string, { data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quote", quoteNumber] });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
  });

  return {
    data: query.data ? asData(query.data.quote.data) : null,
    isLoading: query.isLoading,
    saveData: updateMutation.mutateAsync,
    isSaving: updateMutation.isPending,
  };
};
