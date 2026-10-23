"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api";

export type WarehouseInquiryItem = interfaces.QuoteWarehouseInquiryItem;

// Sales' questions to the warehouse about pieces of 12.5 t or more (the heavy-pieces dialog's
// "Inquire Warehouse"): the warehouse managers answer them on the Warehouse Concept Managers page,
// and the answer reaches the one who asked under the bell.

export const warehouseInquiryKeys = {
  list: ["sales-quote-warehouse-inquiries"] as const,
  answers: ["sales-quote-warehouse-inquiry-answers"] as const,
};

/** The Managers page: the questions waiting and those answered in the last 30 days (managers only). */
export const useWarehouseInquiries = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: warehouseInquiryKeys.list,
    queryFn: async () => (await api.quotes.salesQuoteWarehouseInquiryList()).inquiries,
    refetchInterval: 60_000,
    enabled,
  });
  const decide = useMutation({
    mutationFn: ({ quoteNumber, ...decision }: { quoteNumber: string; inquiryId: string; approve: boolean; priceEurPerPiece?: number | null; comment?: string }) =>
      api.quotes.salesQuoteWarehouseInquiryDecide(quoteNumber, decision),
    onSettled: () => queryClient.invalidateQueries({ queryKey: warehouseInquiryKeys.list }),
  });
  const inquiries = query.data ?? [];
  return {
    inquiries,
    waiting: inquiries.filter((i) => i.inquiry.status === "pending").length,
    isLoading: query.isLoading,
    // A failed load must not read as "nothing to answer".
    isError: query.isError && !query.data,
    decide,
  };
};

/** The bell: answers to the signed-in user's own questions, not opened yet. */
export const useWarehouseInquiryAnswers = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: warehouseInquiryKeys.answers,
    queryFn: async () => (await api.quotes.salesQuoteWarehouseInquiryAnswers()).answers,
    refetchInterval: 30_000,
  });
  const seen = useMutation({
    mutationFn: ({ quoteNumber, inquiryId }: { quoteNumber: string; inquiryId: string }) => api.quotes.salesQuoteWarehouseInquirySeen(quoteNumber, { inquiryId }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: warehouseInquiryKeys.answers }),
  });
  return { answers: query.data ?? [], hasLoaded: query.data !== undefined, seen };
};
