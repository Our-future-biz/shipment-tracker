"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";

export type InvoiceChangeRequest = interfaces.InvoiceChangeRequestItem;

/** Query keys of a shipment's invoice change requests; the managers' list shares the "invoice-change-requests" prefix. */
export const CHANGE_KEYS = {
  ofShipment: (shipmentId: string) => ["invoice-change-requests", "shipment", shipmentId] as const,
  all: ["invoice-change-requests"] as const,
};

/** A shipment's requests to change an invoice on its issue day, newest first (its invoices show the one waiting). */
export function useShipmentChangeRequests(shipmentId: string) {
  return useQuery({
    queryKey: CHANGE_KEYS.ofShipment(shipmentId),
    queryFn: async () => (await api.invoicing.invoicingInvoiceChangeRequestsOfShipment(shipmentId)).requests,
  });
}

/** Asking to change an invoice on its issue day, and taking the request back. */
export function useInvoiceChangeAsk() {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: CHANGE_KEYS.all });
  const ask = useMutation({
    mutationFn: ({ invoiceId, fixes, reason }: { invoiceId: string; fixes: interfaces.InvoiceFixItem[]; reason: string }) =>
      api.invoicing.invoiceChangeAsk(invoiceId, { fixes, reason }),
    onSuccess: refresh,
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => api.invoicing.invoiceChangeRequestWithdraw(id),
    onSuccess: refresh,
  });
  return { ask: ask.mutateAsync, isAsking: ask.isPending, withdraw: withdraw.mutateAsync, isWithdrawing: withdraw.isPending };
}
