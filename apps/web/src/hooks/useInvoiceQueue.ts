"use client";

import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";

export type BillingQueueView = "to_bill" | "not_invoiced" | "invoiced";

/** Query keys of everything built from a shipment's invoices. */
export const INVOICE_KEYS = {
  queueAll: ["invoice-queue"] as const,
  queue: (view: BillingQueueView, search: string) => ["invoice-queue", view, search] as const,
  previewAll: ["invoice-preview"] as const,
  preview: (shipmentId: string, ...params: string[]) => ["invoice-preview", shipmentId, ...params] as const,
  docs: (shipmentId: string) => ["invoice-docs", shipmentId] as const,
};

/**
 * The invoice preview and the billing queue are computed on the server from rates, ROE % and
 * the issuer details too — refresh them whenever any of those change, or the confirm dialog
 * would show a different amount than the one the server then issues.
 */
export function invalidateInvoicingDerived(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: INVOICE_KEYS.previewAll });
  void queryClient.invalidateQueries({ queryKey: INVOICE_KEYS.queueAll });
}

/** The "Ready to bill" queue: jobs by view, searched on the server across all shipments. */
export function useInvoiceQueue(view: BillingQueueView, search: string) {
  const query = useQuery({
    queryKey: INVOICE_KEYS.queue(view, search),
    queryFn: () => api.invoicing.invoiceQueue({ view, ...(search ? { search } : {}) }),
    placeholderData: keepPreviousData,
  });
  return {
    rows: query.data?.queue ?? ([] as interfaces.BillingQueueItem[]),
    counts: query.data?.counts,
    truncated: query.data?.truncated ?? false,
    hasData: query.data !== undefined,
    isFetching: query.isFetching,
    isError: query.isError,
  };
}
