"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fetchAllPages } from "@/lib/fetchAllPages";
import { newestFirst, toSalesQuote, type SalesQuote } from "@/app/sales/_lib/salesQuote";

// One shared empty list, so consumers memoising on `quotes` do not recompute while loading.
const NO_QUOTES: SalesQuote[] = [];

// Every sales quote made for one customer, newest first. The server filters by the customer and
// the quotes are loaded page after page by key, so the page's counts and sums cover all of them
// however many the customer has.
async function fetchCustomerQuotes(customerId: string): Promise<SalesQuote[]> {
  const items = await fetchAllPages((afterId, limit) => api.quotes.salesQuoteList({ customerId, afterId, limit }));
  return items.map(toSalesQuote).sort(newestFirst);
}

export const useCustomerQuotes = (customerId: string) => {
  const query = useQuery({
    queryKey: ["customer-quotes", customerId],
    queryFn: () => fetchCustomerQuotes(customerId),
    enabled: !!customerId,
  });

  return {
    quotes: query.data ?? NO_QUOTES,
    isLoading: query.isLoading,
    // True only when the request failed and there is nothing to show.
    isError: query.isLoadingError,
  };
};
