"use client";

import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isNotFound } from "@/lib/api";
import { salesQuoteKeys } from "@/hooks/salesQueryKeys";
import { invalidateQuoteLists } from "@/hooks/useSalesQuotes";
import { SHIPMENT_WRITE_KEY } from "@/hooks/useShipments";

/**
 * One sales quote as a shipment's header shows it (the quote its Sales Number names), and the way
 * to tell the quote about the shipment when it doesn't know it yet.
 */
export const useSalesQuote = (quoteNumber: string, shipmentId: string) => {
  const queryClient = useQueryClient();
  // A shipment write is on its way - the Sales Number itself may just have been typed, and the
  // quote is told only once the shipment is saved.
  const saving = useIsMutating({ mutationKey: SHIPMENT_WRITE_KEY }) > 0;

  const query = useQuery({
    // The copy of the quote its own page and the bulk actions leave behind; every write of a
    // quote made in this browser marks it out of date (invalidateQuoteLists).
    queryKey: salesQuoteKeys.one(quoteNumber),
    queryFn: () => api.quotes.salesQuoteGet(quoteNumber),
    // Read anew whenever the header appears, however fresh the copy: a link the server made by
    // itself or a colleague's write marks nothing out of date here.
    refetchOnMount: "always",
    // Not asked while a shipment write is on its way: an answer from before the write was
    // finished would say that the quote does not know the shipment. It is asked right after.
    enabled: !saving,
    // "Not found" is an answer, not a failure worth asking about again.
    retry: (failures, err) => !isNotFound(err) && failures < 1,
  });

  // Links without marking the quote Won - a typed Sales Number is not an order.
  const link = useMutation({
    mutationFn: () => api.shipments.shipmentQuoteLink(shipmentId, {}),
    onSuccess: () => invalidateQuoteLists(queryClient),
  });

  return {
    // A request that failed says nothing about the quote: no link is offered on the copy read before it.
    quote: query.isError ? undefined : query.data?.quote,
    notFound: isNotFound(query.error),
    isFetching: query.isFetching,
    saving,
    linkQuote: link.mutateAsync,
    isLinking: link.isPending,
  };
};

/** One sales quote read as it is stored now (e.g. the quote a wizard was opened for). */
export const useSalesQuoteByRef = (quoteNumber: string | null, { enabled = true } = {}) =>
  useQuery({
    queryKey: salesQuoteKeys.one(quoteNumber ?? ""),
    queryFn: () => api.quotes.salesQuoteGet(quoteNumber!),
    enabled: enabled && !!quoteNumber,
    retry: (failures, err) => !isNotFound(err) && failures < 1,
  });
