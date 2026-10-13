"use client";

import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers } from "@/lib/api/client";
import { fetchAllPages, type LoadProgress } from "@/lib/fetchAllPages";
import { toSalesQuote, type SalesQuote } from "@/app/sales/_lib/salesQuote";

/** Which sales quotes: the filters of the list, without the part and the order a page is asked by. */
export type SalesQuoteFilter = Omit<controllers.SalesQuoteListRequest, "limit" | "offset" | "afterId" | "sortBy" | "sortDirection">;

const EVERY_QUOTE: SalesQuoteFilter = {};

// One shared empty list, so screens memoising on `quotes` do not recompute while loading.
const NO_QUOTES: SalesQuote[] = [];

// Every sales quote a filter finds - for the screens that add quotes up or claim to show all of
// them. The quotes are loaded page after page by key, so none is skipped or repeated; they come in
// no order the reader would want, and whoever shows them sorts them. Until the last page is in
// there is nothing to show but how far the load has come, and a page that fails is an error: a
// report over part of the quotes is never passed off as the report.
export const useAllSalesQuotes = (filter: SalesQuoteFilter = EVERY_QUOTE, { enabled = true } = {}) => {
  const queryClient = useQueryClient();
  // Kept beside the quotes rather than in the screen that started the load: the load goes on
  // when that screen is left, and the next one asking for the same quotes joins it.
  const progressKey = ["sales-quotes-progress", filter];

  const query = useQuery({
    queryKey: ["sales-quotes", "all", filter],
    queryFn: async () => {
      // What an earlier load wrote down says nothing about this one.
      queryClient.setQueryData(progressKey, null);
      const items = await fetchAllPages(
        (afterId, limit) => api.quotes.salesQuoteList({ ...filter, afterId, limit }),
        (progress) => queryClient.setQueryData(progressKey, progress),
      );
      return items.map(toSalesQuote);
    },
    enabled,
  });
  // Never fetched: it only shows what the load above writes down.
  const { data: progress } = useQuery<LoadProgress | null>({ queryKey: progressKey, queryFn: skipToken });

  // No quotes and no failure yet: the first load or another try after a failed one - on its way
  // or, while the browser is offline, waiting for the connection. A load that only waits has not
  // found "no quotes" either.
  const isLoading = enabled && query.isPending;

  return {
    quotes: query.data ?? NO_QUOTES,
    isLoading,
    /** How far the load has come; null once it is over or before its first page is in. */
    progress: isLoading ? (progress ?? null) : null,
    // The last load failed. `quotes` may still hold what an earlier one brought: a screen that
    // adds the quotes up shows the error instead, not those as if they were current.
    isError: query.isError && !query.isFetching,
    reload: query.refetch,
  };
};
