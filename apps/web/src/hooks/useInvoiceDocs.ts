"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";

export type InvoiceDoc = interfaces.InvoiceDocItem;
export type InvoicePreview = interfaces.InvoicePreviewItem;

/**
 * Issued invoices / credit notes of a shipment and the preview of the next one.
 * `previewKey` must change whenever the data the invoice is built from changes
 * (selling rows, billing currency), so the preview is recomputed by the server.
 */
export function useInvoiceDocs(shipmentId: string, params: { customerId?: string; duzp?: string; previewKey: string }) {
  const queryClient = useQueryClient();
  const docsKey = ["invoice-docs", shipmentId];

  const preview = useQuery({
    queryKey: ["invoice-preview", shipmentId, params.customerId ?? "", params.duzp ?? "", params.previewKey],
    queryFn: () =>
      api.invoicing.invoiceDocPreview(shipmentId, {
        ...(params.customerId ? { customerId: params.customerId } : {}),
        ...(params.duzp ? { duzp: params.duzp } : {}),
      }),
    placeholderData: keepPreviousData,
  });

  const docs = useQuery({
    queryKey: docsKey,
    queryFn: () => api.invoicing.invoiceDocList(shipmentId),
  });

  const refreshAfterIssue = () => {
    void queryClient.invalidateQueries({ queryKey: docsKey });
    void queryClient.invalidateQueries({ queryKey: ["invoice-preview", shipmentId] });
    // the customer's invoice list (aging) got a new row
    void queryClient.invalidateQueries({ queryKey: ["customer-invoices"] });
  };

  const issue = useMutation({
    mutationFn: (req: { customerId?: string; duzp?: string; note?: string; idempotencyKey: string }) =>
      api.invoicing.invoiceDocIssue(shipmentId, req),
    onSuccess: refreshAfterIssue,
  });

  const credit = useMutation({
    mutationFn: ({ invoiceId, reason, idempotencyKey }: { invoiceId: string; reason: string; idempotencyKey: string }) =>
      api.invoicing.invoiceDocCredit(invoiceId, { reason, idempotencyKey }),
    onSuccess: refreshAfterIssue,
  });

  return {
    preview: preview.data?.preview,
    previewLoading: preview.isFetching,
    previewError: preview.error,
    docs: docs.data?.invoices ?? [],
    docsLoading: docs.isLoading,
    issue: issue.mutateAsync,
    isIssuing: issue.isPending,
    credit: credit.mutateAsync,
    isCrediting: credit.isPending,
  };
}

/** Downloads the stored, official PDF of an invoice / credit note. */
export async function downloadInvoicePdf(invoiceId: string) {
  const { fileName, contentBase64 } = await api.invoicing.invoiceDocPdf(invoiceId);
  const bytes = Uint8Array.from(atob(contentBase64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
