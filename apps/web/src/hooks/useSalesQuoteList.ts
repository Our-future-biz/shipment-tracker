"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers } from "@/lib/api/client";
import { toSalesQuote } from "@/app/sales/_lib/salesQuote";
import { salesQuoteKeys } from "@/hooks/salesQueryKeys";

// One page of the company's sales quotes, as the server filters, searches, sorts and counts them:
// the rows on screen are that page and `total` is the number of quotes the filter really finds,
// whatever part of them was asked for. A screen that needs every quote uses useAllSalesQuotes.
// With `enabled: false` nothing is asked: the rows read last stay, and are not being replaced.
export const useSalesQuoteList = (params: controllers.SalesQuoteListRequest, { enabled = true } = {}) => {
  const query = useQuery({
    queryKey: salesQuoteKeys.list(params),
    queryFn: () => api.quotes.salesQuoteList(params),
    // The rows of the last page or filter stay on screen until the new ones are there.
    placeholderData: (prev) => prev,
    // Colleagues work on the same quotes, and a quote expires or falls due for a follow-up by the
    // clock: the page is read again when the viewer comes back to it, and never on a timer.
    refetchOnWindowFocus: true,
    enabled,
  });

  const quotes = useMemo(() => (query.data?.data ?? []).map(toSalesQuote), [query.data]);

  return {
    quotes,
    // Undefined until the server has counted: a request that failed or is still out found no "0 quotes".
    total: query.data?.pagination.total,
    // The rows asked for are not on screen yet - nothing is, or the page before. Their request is
    // on its way or, while the browser is offline, waits for the connection: either way no answer
    // says the list is empty.
    isLoading: enabled && (query.isPending || query.isPlaceholderData),
    // The last request failed. Rows read earlier may still be shown, and may be out of date.
    isError: query.isError && !query.isFetching,
    reload: query.refetch,
  };
};
