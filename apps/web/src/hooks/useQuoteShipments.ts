"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";

/** A live shipment that names a quote as its Sales Reference. */
export type QuoteShipment = interfaces.QuoteShipments["shipments"][number];

// The live shipments that name each of `references` - the quotes on one page of a list - read
// from the shipments in one request: a quote keeps only the oldest of them. Its own key, not one
// under "shipments": the shipment hooks read every cache under that one as a list of shipments.
export const useQuoteShipments = (references: string[]) => {
  const query = useQuery({
    queryKey: ["quote-shipments", references],
    queryFn: () => api.shipments.shipmentsNamingQuotes({ references }),
    enabled: references.length > 0,
    // The counts of the last page stay until the new ones are there.
    placeholderData: (prev) => prev,
    // Colleagues create shipments meanwhile: the counts are read again when the viewer comes back.
    refetchOnWindowFocus: true,
  });

  // Undefined for a quote while its answer is not here: the request is out, or failed.
  const byReference = useMemo(
    () => (query.data ? new Map(query.data.quotes.map((quote) => [quote.reference, quote.shipments])) : undefined),
    [query.data],
  );
  return { byReference };
};
