"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toSalesQuote, isSalesQuote, type SalesQuote } from "@/app/sales/_lib/salesQuote";

// The most quotes one request returns (the API's cap).
const CUSTOMER_QUOTES_LIMIT = 1000;

// The sales quotes made for one customer, filtered server-side — so the customer page does not
// depend on the customer's quotes being among the company's newest ones.
export const useCustomerQuotes = (customerId: string) => {
  const queryClient = useQueryClient();
  const key = ["customer-quotes", customerId];

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.quotes.quoteList({ customerId, limit: CUSTOMER_QUOTES_LIMIT }),
    enabled: !!customerId,
  });

  const quotes: SalesQuote[] = useMemo(() => (query.data?.data ?? []).filter(isSalesQuote).map(toSalesQuote), [query.data]);

  const deleteMutation = useMutation({
    mutationFn: (quoteNumber: string) => api.quotes.quoteDelete(quoteNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      // The delete is company-wide, so the Sales module must drop the quote as well.
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
  });

  return {
    quotes,
    isLoading: query.isLoading,
    // True only when the request failed and there is nothing to show.
    isError: query.isLoadingError,
    deleteQuote: deleteMutation.mutateAsync,
  };
};
