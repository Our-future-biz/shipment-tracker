"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api";
import { INVOICE_KEYS } from "./useInvoiceQueue";
import { invoicingKey } from "./useInvoicing";
import { FX_KEYS } from "./useFx";
import { customerShipmentFinancialsKeys } from "./useCustomerShipmentFinancials";
import { invalidateShipmentCustomerViews, invalidateShipmentDerivedViews } from "./useShipments";
import { creditNoteRequestKeys } from "./useCreditNoteRequests";

export type InvoiceChangeRequestItem = interfaces.InvoiceChangeRequestItem;

// Changing an invoice on its issue day: asked from the invoice (what is wrong, and why) and
// answered on Sales → Managers → Billing approvals the same day; a request still waiting at
// midnight Prague time expires. Approving cancels the invoice (kept on record, no credit note):
// its lines go back to be billed and it is issued again corrected under the next number.

export const invoiceChangeRequestKeys = {
  all: ["invoice-change-requests"] as const,
  list: ["invoice-change-requests", "list"] as const,
  forMe: ["invoice-change-requests", "for-me"] as const,
};

/**
 * An answer moves the request everywhere it shows (this list, the bell, the invoice's own
 * request), and an approval cancels the invoice: the shipment's invoices and lines to bill, its
 * statuses, the customer's invoice list and what the invoice could still be credited by all move.
 */
const refreshAfterAnswer = (queryClient: QueryClient, request: InvoiceChangeRequestItem | undefined) => {
  void queryClient.invalidateQueries({ queryKey: invoiceChangeRequestKeys.all });
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

/** The managers' list: what waits today and what was answered (or expired) in the last 30 days, and their answer. */
export const useInvoiceChangeRequests = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: invoiceChangeRequestKeys.list,
    queryFn: async () => (await api.invoicing.invoiceChangeRequestList()).requests,
    refetchInterval: 60_000,
  });
  const requests = query.data ?? [];
  const decide = useMutation({
    mutationFn: ({ id, ...answer }: { id: string; decision: "approve" | "reject"; comment?: string }) => api.invoicing.invoiceChangeRequestDecide(id, answer),
    // Refused too (expired at midnight, the invoice changed since): the request and the invoice are read again.
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

/** The bell: requests waiting, for a manager, and answers (expired ones too) to what the user asked. */
export const useInvoiceChangeRequestBell = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: invoiceChangeRequestKeys.forMe,
    queryFn: () => api.invoicing.invoiceChangeRequestForMe(),
    refetchInterval: 30_000,
  });
  const seen = useMutation({
    mutationFn: (ids: string[]) => api.invoicing.invoiceChangeRequestSeen({ ids }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: invoiceChangeRequestKeys.forMe }),
  });
  return { waiting: query.data?.waiting ?? [], answers: query.data?.answers ?? [], hasLoaded: query.data !== undefined, seen };
};
