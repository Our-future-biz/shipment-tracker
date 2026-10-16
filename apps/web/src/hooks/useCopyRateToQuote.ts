"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers } from "@/lib/api/client";
import { invalidateQuoteLists } from "./useSalesQuotes";

export type QuoteRoadPriceRequest = Omit<controllers.SalesQuoteRoadPriceRequest, "expectedDataVersion">;

/** A copy that failed after the quote existed: the quote is named so the user can open it. */
export class CopyToQuoteError extends Error {
  constructor(
    readonly cause: unknown,
    readonly quoteNumber: string | null,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
  }
}

interface CopyToQuote {
  /** A new Road quote (optionally for a customer), or an existing quote's number. */
  target: { kind: "new"; customer: { customerId: string; customerName: string | null } | null } | { kind: "existing"; quoteNumber: string };
  price: QuoteRoadPriceRequest;
}

/** The rate calculator's "Copy to quote": the quote is created or read, then priced by the server. */
export function useCopyRateToQuote() {
  const queryClient = useQueryClient();
  const copy = useMutation({
    mutationFn: async ({ target, price }: CopyToQuote): Promise<string> => {
      let quoteNumber: string | null = null;
      try {
        const stored =
          target.kind === "new"
            ? (await api.quotes.salesQuoteCreate({ data: { serviceType: "Road", ...(target.customer ?? {}) } })).quote
            : (await api.quotes.salesQuoteGet(target.quoteNumber)).quote;
        quoteNumber = stored.quoteNumber;
        await api.quotes.salesQuoteRoadPrice(stored.quoteNumber, { ...price, expectedDataVersion: stored.dataVersion });
        return stored.quoteNumber;
      } catch (e) {
        throw new CopyToQuoteError(e, quoteNumber);
      } finally {
        // A quote created (or priced) changes the lists, even when pricing failed afterwards.
        if (quoteNumber) invalidateQuoteLists(queryClient);
      }
    },
  });
  return { copyToQuote: copy.mutateAsync, isCopying: copy.isPending };
}
