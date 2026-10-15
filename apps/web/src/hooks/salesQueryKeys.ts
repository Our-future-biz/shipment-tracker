import type { controllers } from "@/lib/api/client";

/** Which sales quotes a complete load covers (see useAllSalesQuotes). */
export type SalesQuoteFilter = Omit<controllers.SalesQuoteListRequest, "limit" | "offset" | "afterId" | "sortBy" | "sortDirection">;

/**
 * Query keys of Sales. Every reader and writer takes its key from here, so an invalidation can't
 * miss a copy because a literal was spelled differently.
 */
export const salesQuoteKeys = {
  /** Every list of quotes: pages, complete loads, pickers, a quote's variants. */
  lists: ["sales-quotes"] as const,
  list: (params: controllers.SalesQuoteListRequest) => ["sales-quotes", params] as const,
  all: (filter: SalesQuoteFilter) => ["sales-quotes", "all", filter] as const,
  progress: (filter: SalesQuoteFilter) => ["sales-quotes-progress", filter] as const,
  /** Every single quote read on its own (a quote page, a shipment's Sales Number link). */
  quotes: ["sales-quote"] as const,
  one: (quoteNumber: string) => ["sales-quote", quoteNumber] as const,
};

/** The customer page's own, customer-filtered copy of the quotes. */
export const customerQuotesKeys = {
  all: ["customer-quotes"] as const,
  of: (customerId: string) => ["customer-quotes", customerId] as const,
};

/** Manual follow-up tasks. */
export const followupTaskKeys = {
  all: ["followup-tasks"] as const,
  open: (assignee: string | undefined) => ["followup-tasks", "open", assignee] as const,
  done: (assignee: string | undefined, page: number, pageSize: number) => ["followup-tasks", "done", assignee, page, pageSize] as const,
};
