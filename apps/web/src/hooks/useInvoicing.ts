"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const INVOICING_KEY = "invoicing";

/** Every shipment's invoicing data: what a write elsewhere that it shows marks out of date. */
export const invoicingKeys = { all: [INVOICING_KEY] as const };

/** One shipment's costs, billing settings and old generated invoices — one cache entry. */
export const invoicingKey = (shipmentId: string | null) => [INVOICING_KEY, shipmentId];

export const useInvoicing = (shipmentId: string | null) => {
  const query = useQuery({
    queryKey: invoicingKey(shipmentId),
    queryFn: () => api.invoicing.invoicingGet(shipmentId!),
    enabled: !!shipmentId,
  });
  return { data: query.data, isLoading: query.isLoading, isError: query.isError };
};
