"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// A supplier's open jobs and when it was last put on one, from the shipments' cost lines linked to it
// (Council Review 5, m21): the "Open jobs" tile, and whether a low rating needs saying (a supplier in use).
export function useSupplierUsage(customerId: string, { enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: ["supplier-usage", customerId],
    queryFn: () => api.invoicing.invoicingSupplierUsage(customerId),
    enabled: !!customerId && enabled,
  });
  return { usage: query.data ?? null, isLoading: query.isLoading, isError: query.isError };
}
