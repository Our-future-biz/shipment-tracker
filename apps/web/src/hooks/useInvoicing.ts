"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** One shipment's costs, billing settings and old generated invoices — one cache entry. */
export const invoicingKey = (shipmentId: string | null) => ["invoicing", shipmentId];

export const useInvoicing = (shipmentId: string | null) => {
  const query = useQuery({
    queryKey: invoicingKey(shipmentId),
    queryFn: () => api.invoicing.invoicingGet(shipmentId!),
    enabled: !!shipmentId,
  });
  return { data: query.data, isLoading: query.isLoading, isError: query.isError };
};
