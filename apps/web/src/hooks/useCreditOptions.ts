"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";

export type CreditOptions = interfaces.CreditOptionsItem;
export type CreditableLine = interfaces.CreditableLineItem;
export type CreditNoteRequest = interfaces.CreditNoteRequestItem;

/** Query keys of partial credit notes; the managers' Billing approvals list shares the "credit-note-requests" prefix. */
export const CREDIT_KEYS = {
  options: (invoiceId: string) => ["credit-options", invoiceId] as const,
  optionsAll: ["credit-options"] as const,
  ofShipment: (shipmentId: string) => ["credit-note-requests", "shipment", shipmentId] as const,
  requestsAll: ["credit-note-requests"] as const,
};

/** The credit dialog: what is left of each line of the invoice, and a partial credit note already waiting. */
export function useCreditOptions(invoiceId: string | null) {
  return useQuery({
    queryKey: CREDIT_KEYS.options(invoiceId ?? ""),
    queryFn: async () => (await api.invoicing.invoiceCreditOptions(invoiceId!)).options,
    enabled: !!invoiceId,
  });
}

/** A shipment's partial credit note requests, newest first (its invoices show the one waiting). */
export function useShipmentCreditRequests(shipmentId: string) {
  return useQuery({
    queryKey: CREDIT_KEYS.ofShipment(shipmentId),
    queryFn: async () => (await api.invoicing.invoicingCreditNoteRequestsOfShipment(shipmentId)).requests,
  });
}

/** Asking for a partial credit note, and taking one back. */
export function useCreditRequestMutations() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: CREDIT_KEYS.optionsAll });
    void queryClient.invalidateQueries({ queryKey: CREDIT_KEYS.requestsAll });
  };
  const ask = useMutation({
    mutationFn: ({ invoiceId, lines, reason }: { invoiceId: string; lines: { lineId: string; amount: string }[]; reason: string }) =>
      api.invoicing.invoicePartialCreditAsk(invoiceId, { lines, reason }),
    onSuccess: refresh,
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => api.invoicing.creditNoteRequestWithdraw(id),
    onSuccess: refresh,
  });
  return { ask: ask.mutateAsync, isAsking: ask.isPending, withdraw: withdraw.mutateAsync, isWithdrawing: withdraw.isPending };
}
