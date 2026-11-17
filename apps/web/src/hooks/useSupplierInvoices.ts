"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, isNotFound } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api";
import { supplierInvoiceKeys } from "./supplierInvoiceKeys";
import { invoicingKey, invoicingKeys } from "./useInvoicing";
import { invalidateInvoicingDerived } from "./useInvoiceQueue";

// Finance → Accounts Payable (Council Outlay 9): the list of supplier invoices, one invoice with its history,
// and what a manager does to it (D5, D8, D11, D13). Every write sends the version the user saw: an invoice that
// changed meanwhile is refused, to be looked at again.

export type PayablesResponse = interfaces.PayablesResponse;
export type PayableDetail = interfaces.PayableDetailResponse;

/** Everyone reads it (D5); read again every minute, as the managers' lists are. */
export const useSupplierInvoices = () => {
  const query = useQuery({
    queryKey: supplierInvoiceKeys.list,
    queryFn: () => api.invoicing.supplierInvoiceList(),
    refetchInterval: 60_000,
  });
  return {
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    // A failed load must not read as "nothing to pay".
    isError: query.isError && !query.data,
  };
};

/** One invoice, its history and the lines it had when refused. */
export const useSupplierInvoice = (id: string | null) =>
  useQuery({
    queryKey: supplierInvoiceKeys.detail(id ?? ""),
    queryFn: () => api.invoicing.supplierInvoiceGet(id!),
    enabled: !!id,
    // "Not there" is an answer (a link to an invoice of another company, or a wrong id).
    retry: (failures, err) => !isNotFound(err) && failures < 1,
  });

/**
 * A decision on an invoice moves its lines (Paid, a refusal taking them off the jobs, a supplier linked), so the
 * Costs Breakdown of every job they are on is read again, and the shipments list and What we owe with it. The
 * invoice as it was before is passed too: a refused invoice has no lines left on the jobs it was on.
 */
function refreshAfterChange(queryClient: QueryClient, before: interfaces.PayableInvoiceItem | undefined, after: PayableDetail | undefined) {
  void queryClient.invalidateQueries({ queryKey: supplierInvoiceKeys.all });
  const lines = [...(before?.lines ?? []), ...(after?.invoice.lines ?? [])];
  const shipmentIds = new Set<string>();
  const masterJobIds = new Set<string>();
  for (const l of lines) {
    if (l.shipmentId) shipmentIds.add(l.shipmentId);
    if (l.masterJobId) masterJobIds.add(l.masterJobId);
  }
  for (const l of after?.refusedLines ?? []) (l.kind === "job" ? shipmentIds : masterJobIds).add(l.ownerId);
  for (const id of shipmentIds) void queryClient.invalidateQueries({ queryKey: invoicingKey(id) });
  // A master job's line is shared out to its jobs, which the invoice does not name: every job's costs then.
  if (masterJobIds.size) void queryClient.invalidateQueries({ queryKey: invoicingKeys.all });
  for (const id of masterJobIds) void queryClient.invalidateQueries({ queryKey: ["master-jobs", id, "costs"] });
  void queryClient.invalidateQueries({ queryKey: ["shipments"] });
  // …and what is worked out from those costs elsewhere: the Invoicing queue, the invoice preview and the
  // customer's Shipments tab figures (a refusal takes real costs off the jobs), as the job's Costs tab does.
  invalidateInvoicingDerived(queryClient);
  // The supplier's What we owe (Customer Database) counts the same lines, and its Open jobs follow a supplier link.
  void queryClient.invalidateQueries({ queryKey: ["supplier-costs"] });
  void queryClient.invalidateQueries({ queryKey: ["supplier-usage"] });
}

type Target = { invoice: interfaces.PayableInvoiceItem };
type Reasoned = Target & { reason: string };
/** The invoice's own details as on the document: dates, totals, currency, invoice or credit note. */
export type SupplierInvoiceDetails = Omit<Parameters<typeof api.invoicing.supplierInvoiceDetails>[1], "version">;

/** The actions of the drawer, each sending the invoice's version. */
export const useSupplierInvoiceActions = () => {
  const queryClient = useQueryClient();
  const settle = (data: PayableDetail | undefined, vars: Target) => {
    // The answer is the invoice as it is now: shown at once, then everything it touches is read again.
    if (data) queryClient.setQueryData(supplierInvoiceKeys.detail(data.invoice.id), data);
    refreshAfterChange(queryClient, vars.invoice, data);
  };
  // Settled, not only on success: a refusal for a changed version means what the user saw is stale.
  const approve = useMutation({
    mutationFn: ({ invoice }: Target) => api.invoicing.supplierInvoiceApprove(invoice.id, { version: invoice.version }),
    onSettled: (data, _e, vars) => settle(data, vars),
  });
  const refuse = useMutation({
    mutationFn: ({ invoice, reason }: Reasoned) => api.invoicing.supplierInvoiceRefuse(invoice.id, { version: invoice.version, reason }),
    onSettled: (data, _e, vars) => settle(data, vars),
  });
  const takeBackApproval = useMutation({
    mutationFn: ({ invoice, reason }: Reasoned) => api.invoicing.supplierInvoiceTakeBackApproval(invoice.id, { version: invoice.version, reason }),
    onSettled: (data, _e, vars) => settle(data, vars),
  });
  const markPaid = useMutation({
    mutationFn: ({ invoice, paidOn }: Target & { paidOn: string }) => api.invoicing.supplierInvoicePaid(invoice.id, { version: invoice.version, paidOn }),
    onSettled: (data, _e, vars) => settle(data, vars),
  });
  const takeBackPayment = useMutation({
    mutationFn: ({ invoice, reason }: Reasoned) => api.invoicing.supplierInvoiceTakeBackPayment(invoice.id, { version: invoice.version, reason }),
    onSettled: (data, _e, vars) => settle(data, vars),
  });
  const linkSupplier = useMutation({
    mutationFn: ({ invoice, supplierCustomerId }: Target & { supplierCustomerId: string }) =>
      api.invoicing.supplierInvoiceLinkSupplier(invoice.id, { version: invoice.version, supplierCustomerId }),
    onSettled: (data, _e, vars) => settle(data, vars),
  });
  const setDetails = useMutation({
    mutationFn: ({ invoice, details }: Target & { details: SupplierInvoiceDetails }) =>
      api.invoicing.supplierInvoiceDetails(invoice.id, { ...details, version: invoice.version }),
    onSettled: (data, _e, vars) => settle(data, vars),
  });
  const pending = [approve, refuse, takeBackApproval, markPaid, takeBackPayment, linkSupplier, setDetails].some((m) => m.isPending);
  return { approve, refuse, takeBackApproval, markPaid, takeBackPayment, linkSupplier, setDetails, pending };
};

/** An invoice opened on the page is seen: the bell stops telling of it (D10). */
export const useSupplierInvoiceSeen = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.invoicing.supplierInvoiceSeen({ ids }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: supplierInvoiceKeys.forMe }),
  });
};

/**
 * A claim on costs raised from the drawer (D15): the job's Claims tab's own call, on the job the claim is on. The
 * job's claims and Claim field read again as there, and Accounts Payable with them: an open claim holds the
 * invoice's payment and puts it in the Claimed tab.
 */
export const useRaiseCostClaim = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shipmentId, values }: { shipmentId: string; values: Omit<controllers.ClaimCreateRequest, "kind"> }) =>
      api.shipments.claimCreate(shipmentId, { ...values, kind: "cost" }),
    onSuccess: (_claim, { shipmentId }) => {
      void queryClient.invalidateQueries({ queryKey: ["shipment-claims", shipmentId] });
      void queryClient.invalidateQueries({ queryKey: ["shipments"] });
      void queryClient.invalidateQueries({ queryKey: supplierInvoiceKeys.all });
    },
  });
};
