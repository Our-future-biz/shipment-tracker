"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { INVOICE_KEYS } from "./useInvoiceQueue";
import { invoicingKey } from "./useInvoicing";
import { FX_KEYS } from "./useFx";
import { invalidateShipmentCustomerViews, invalidateShipmentDerivedViews } from "./useShipments";
import { saveBlob, type PreviewSource } from "./useFilePreview";

export type InvoiceDoc = interfaces.InvoiceDocItem;
export type InvoicePreview = interfaces.InvoicePreviewItem;

/**
 * Issued invoices / credit notes of a shipment and the preview of the next one.
 * `previewKey` must change whenever the data the invoice is built from changes
 * (selling rows, billing currency), so the preview is recomputed by the server.
 */
export function useInvoiceDocs(shipmentId: string, params: { customerId?: string; duzp?: string; previewKey: string }) {
  const queryClient = useQueryClient();
  const docsKey = INVOICE_KEYS.docs(shipmentId);

  const preview = useQuery({
    queryKey: INVOICE_KEYS.preview(shipmentId, params.customerId ?? "", params.duzp ?? "", params.previewKey),
    queryFn: () =>
      api.invoicing.invoiceDocPreview(shipmentId, {
        ...(params.customerId ? { customerId: params.customerId } : {}),
        ...(params.duzp ? { duzp: params.duzp } : {}),
      }),
    placeholderData: keepPreviousData,
  });

  const docs = useInvoiceDocList(shipmentId);

  const refreshAfterIssue = () => {
    void queryClient.invalidateQueries({ queryKey: docsKey });
    void queryClient.invalidateQueries({ queryKey: INVOICE_KEYS.preview(shipmentId) });
    void queryClient.invalidateQueries({ queryKey: INVOICE_KEYS.queueAll });
    // issuing / crediting moves the shipment's Shipment Status and Invoicing Status…
    void queryClient.invalidateQueries({ queryKey: ["shipments"] });
    // …so the views computed from them (tiles, needs-attention, customer pages) move too
    invalidateShipmentDerivedViews(queryClient);
    invalidateShipmentCustomerViews(queryClient);
    // the customer's invoice list (aging) got a new row
    void queryClient.invalidateQueries({ queryKey: ["customer-invoices"] });
    // the costs card, and the job's rate lock, which becomes final once invoiced
    void queryClient.invalidateQueries({ queryKey: invoicingKey(shipmentId) });
    void queryClient.invalidateQueries({ queryKey: FX_KEYS.jobAll(shipmentId) });
  };

  const issue = useMutation({
    mutationFn: (req: { customerId?: string; duzp?: string; note?: string; idempotencyKey: string; expectedGross?: number }) =>
      api.invoicing.invoiceDocIssue(shipmentId, req),
    onSuccess: refreshAfterIssue,
    // Refused (the invoice changed since its preview, a row billed meanwhile): the rows and the preview
    // are read again, so what is looked at again is the invoice the server would issue now.
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: invoicingKey(shipmentId) });
      void queryClient.invalidateQueries({ queryKey: INVOICE_KEYS.preview(shipmentId) });
    },
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
    // Until the list is in, "no invoices" is not known: which rows are billed already is not either.
    docsLoaded: docs.data !== undefined,
    // The list could not be loaded (and none was before): not an empty one.
    docsError: docs.isLoadingError,
    refetchDocs: docs.refetch,
    issue: issue.mutateAsync,
    isIssuing: issue.isPending,
    credit: credit.mutateAsync,
    isCrediting: credit.isPending,
  };
}

/** Issued invoices and credit notes of a shipment (newest last). */
export function useInvoiceDocList(shipmentId: string) {
  return useQuery({
    queryKey: INVOICE_KEYS.docs(shipmentId),
    queryFn: () => api.invoicing.invoiceDocList(shipmentId),
  });
}

/** The PDF the server sends as base64, as bytes. */
const pdfBlob = (contentBase64: string) =>
  new Blob([Uint8Array.from(atob(contentBase64), (c) => c.charCodeAt(0))], { type: "application/pdf" });

/**
 * The stored, official PDF of an invoice / credit note, for the app's preview (useFilePreview).
 * It is sent only with the login header, as base64, so it is loaded, never linked. Named as the
 * server names it.
 */
export const invoicePdfSource = (doc: Pick<InvoiceDoc, "id" | "number">): PreviewSource => ({
  fileName: `${doc.number}.pdf`,
  fileType: "application/pdf",
  load: async () => pdfBlob((await api.invoicing.invoiceDocPdf(doc.id)).contentBase64),
});

/** Downloads the stored, official PDF of an invoice / credit note. */
export async function downloadInvoicePdf(invoiceId: string) {
  const { fileName, contentBase64 } = await api.invoicing.invoiceDocPdf(invoiceId);
  saveBlob(pdfBlob(contentBase64), fileName);
}
