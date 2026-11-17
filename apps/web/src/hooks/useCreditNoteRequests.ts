"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api";
import { INVOICE_KEYS } from "./useInvoiceQueue";
import { invoicingKey } from "./useInvoicing";
import { FX_KEYS } from "./useFx";
import { customerShipmentFinancialsKeys } from "./useCustomerShipmentFinancials";
import { invalidateShipmentCustomerViews, invalidateShipmentDerivedViews } from "./useShipments";

export type CreditNoteRequest = interfaces.CreditNoteRequestItem;

// Crediting an invoice in part: asked from the invoice, line by line with a reason, and answered
// on Sales → Managers → Billing approvals. Approving issues the credit note at once.

export const creditNoteRequestKeys = {
  all: ["credit-note-requests"] as const,
  list: ["credit-note-requests", "list"] as const,
  forMe: ["credit-note-requests", "for-me"] as const,
};

/**
 * An answer moves the request everywhere it shows (this list, the bell, the invoice's own
 * request and what is left to credit), and an approval issues a credit note: the shipment's
 * invoices, its statuses and the views computed from them move as after any credit note.
 */
const refreshAfterAnswer = (queryClient: QueryClient, request: CreditNoteRequest | undefined) => {
  void queryClient.invalidateQueries({ queryKey: creditNoteRequestKeys.all });
  void queryClient.invalidateQueries({ queryKey: ["credit-options"] });
  if (!request) return;
  const { shipmentId } = request;
  void queryClient.invalidateQueries({ queryKey: INVOICE_KEYS.docs(shipmentId) });
  void queryClient.invalidateQueries({ queryKey: INVOICE_KEYS.preview(shipmentId) });
  void queryClient.invalidateQueries({ queryKey: invoicingKey(shipmentId) });
  void queryClient.invalidateQueries({ queryKey: INVOICE_KEYS.queueAll });
  void queryClient.invalidateQueries({ queryKey: ["shipments"] });
  invalidateShipmentDerivedViews(queryClient);
  invalidateShipmentCustomerViews(queryClient);
  void queryClient.invalidateQueries({ queryKey: ["customer-invoices"] });
  void queryClient.invalidateQueries({ queryKey: customerShipmentFinancialsKeys.all });
  void queryClient.invalidateQueries({ queryKey: FX_KEYS.jobAll(shipmentId) });
};

/** The managers' list: what waits and what was answered in the last 30 days, and their answer. */
export const useCreditNoteRequests = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: creditNoteRequestKeys.list,
    queryFn: async () => (await api.invoicing.creditNoteRequestList()).requests,
    refetchInterval: 60_000,
  });
  const requests = query.data ?? [];
  const decide = useMutation({
    mutationFn: ({ id, ...answer }: { id: string; decision: "approve" | "reject"; comment?: string }) => api.invoicing.creditNoteRequestDecide(id, answer),
    // Refused too (the invoice changed since it was asked): the request and the invoice are read again.
    onSettled: (data, _error, { id }) => refreshAfterAnswer(queryClient, data?.request ?? requests.find((r) => r.id === id)),
  });
  return {
    requests,
    waiting: requests.filter((r) => r.status === "pending").length,
    isLoading: query.isLoading,
    // A failed load must not read as "nothing to answer".
    isError: query.isError && !query.data,
    decide,
  };
};

/** The bell: requests waiting, for a manager, and answers to what the user asked. */
export const useCreditNoteRequestBell = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: creditNoteRequestKeys.forMe,
    queryFn: () => api.invoicing.creditNoteRequestForMe(),
    refetchInterval: 30_000,
  });
  const seen = useMutation({
    mutationFn: (ids: string[]) => api.invoicing.creditNoteRequestSeen({ ids }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: creditNoteRequestKeys.forMe }),
  });
  return { waiting: query.data?.waiting ?? [], answers: query.data?.answers ?? [], hasLoaded: query.data !== undefined, seen };
};
