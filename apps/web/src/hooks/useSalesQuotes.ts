"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import type { SalesQuoteData } from "@/app/sales/_lib/types";
import { quoteProblem } from "@/app/sales/_lib/quoteProblem";
import { customerQuotesKeys, quoteShipmentsKeys, salesQuoteKeys } from "@/hooks/salesQueryKeys";

// How many quotes a bulk action changes at the same time.
const BULK_CONCURRENCY = 4;

/**
 * What a bulk action does to one quote: one request to the endpoint that changes it. An endpoint
 * that can tell says with `changed: false` that the quote already was what the action makes it.
 */
export type QuoteCall = (quoteNumber: string) => Promise<{ quote: interfaces.SalesQuoteItem; changed?: boolean }>;

// Every copy of the quotes that is kept outside the quote page has to be read again once a quote
// was written. Resolves when the copies on screen have been, so whoever wrote can open a list or
// a quote right after and find it up to date.
// With `refetchType: "none"` they are only marked out of date and read again when next shown.
export const invalidateQuoteLists = (queryClient: QueryClient, { refetchType }: { refetchType?: "none" } = {}) =>
  Promise.all([
    // The customer page keeps its own, customer-filtered copy of the quotes.
    queryClient.invalidateQueries({ queryKey: customerQuotesKeys.all, refetchType }),
    // Every list of Sales: the pages of Quotes and Follow-up, the pickers, the variants of a
    // quote and the complete loads of the reports.
    queryClient.invalidateQueries({ queryKey: salesQuoteKeys.lists, refetchType }),
    // The header of a shipment shows the quote its Sales Number names, read one by one.
    queryClient.invalidateQueries({ queryKey: salesQuoteKeys.quotes, refetchType }),
    // The Shipment(s) column counts the shipments naming each quote: a shipment created, deleted
    // or given another Sales Reference changes it.
    queryClient.invalidateQueries({ queryKey: quoteShipmentsKeys.all, refetchType }),
  ]);

// What Sales does to whole quotes: creating, duplicating and deleting them, and changing them
// from a list. Editing the quote a page has open is useSalesQuoteDraft; reading quotes is
// useSalesQuoteList (one page) and useAllSalesQuotes (everything a filter finds).
export const useSalesQuotes = () => {
  const queryClient = useQueryClient();

  const invalidate = () => invalidateQuoteLists(queryClient);

  // The server gives a new quote its reference while storing it, so two people creating at once
  // get two different numbers, and makes it a Draft of whoever creates it. `data` is only what
  // the quote starts with; resolves with the reference it was given.
  const createMutation = useMutation({
    mutationFn: async (data: SalesQuoteData) => {
      const { quote } = await api.quotes.salesQuoteCreate({ data });
      return quote.quoteNumber;
    },
    onSuccess: invalidate,
  });

  // One action applied to several quotes (the bulk actions in the Quotes list). `call` asks the
  // server for it quote by quote, four at a time, through the endpoint the quote page uses for
  // the same thing - so the same rules decide, and each quote is changed as it is stored now, not
  // as the list remembers it. Resolves with what happened: how many quotes were changed, how many
  // already were what the action makes them, and the ones the server refused, each with its reason.
  const bulkMutation = useMutation({
    mutationFn: async ({ quoteNumbers, call }: { quoteNumbers: string[]; call: QuoteCall }) => {
      const outcomes: ("changed" | "unchanged" | { quoteNumber: string; reason: string })[] = [];
      let next = 0;
      // Each worker takes the next quote nobody has taken yet, until none is left.
      const work = async () => {
        while (next < quoteNumbers.length) {
          const index = next++;
          const quoteNumber = quoteNumbers[index]!;
          try {
            const answer = await call(quoteNumber);
            // The newest copy there is, whether or not the quote was written.
            queryClient.setQueryData(salesQuoteKeys.one(quoteNumber), { quote: answer.quote });
            outcomes[index] = answer.changed === false ? "unchanged" : "changed";
          } catch (err) {
            // Whatever is remembered about this quote may be older than what is stored.
            queryClient.removeQueries({ queryKey: salesQuoteKeys.one(quoteNumber) });
            outcomes[index] = { quoteNumber, reason: quoteProblem(err).reason };
          }
        }
      };
      await Promise.all(Array.from({ length: BULK_CONCURRENCY }, work));
      return {
        changed: outcomes.filter((outcome) => outcome === "changed").length,
        unchanged: outcomes.filter((outcome) => outcome === "unchanged").length,
        failed: outcomes.filter((outcome) => typeof outcome === "object"),
      };
    },
    onSuccess: invalidate,
  });

  // A variant of `baseRef` (its reference with the next free -2, -3, ...) holding `data`. Like a
  // new quote it is a Draft of whoever makes it, whatever the copied quote was.
  const duplicateMutation = useMutation({
    mutationFn: async ({ baseRef, data }: { baseRef: string; data: SalesQuoteData }) => {
      const { quote } = await api.quotes.salesQuoteDuplicate(baseRef, { data });
      return quote.quoteNumber;
    },
    onSuccess: invalidate,
  });

  // A contact with the customer, recorded from a list: the quote's follow-up flag goes off for
  // three days and its history gets a line. Settles once the lists are read again - also after a
  // refusal, which says that the quote is no longer what the list shows.
  const followUpMutation = useMutation({
    mutationFn: ({ quoteNumber, note }: { quoteNumber: string; note?: string }) => api.quotes.salesQuoteFollowUp(quoteNumber, { note }),
    onSettled: invalidate,
  });

  // Whether a quote may be deleted is the server's call, made on the quote as it is stored now:
  // the Delete button was offered by what the quote was when the screen read it. Settles once the
  // lists are read again - also after a refusal, which says that the quote is no longer what the
  // list shows.
  const deleteMutation = useMutation({
    mutationFn: (quoteNumber: string) => api.quotes.salesQuoteDelete(quoteNumber),
    onSettled: invalidate,
  });

  return {
    createQuote: createMutation.mutateAsync,
    runOnQuotes: bulkMutation.mutateAsync,
    isRunningOnQuotes: bulkMutation.isPending,
    duplicateQuote: duplicateMutation.mutateAsync,
    followUpQuote: followUpMutation.mutateAsync,
    deleteQuote: deleteMutation.mutateAsync,
  };
};
