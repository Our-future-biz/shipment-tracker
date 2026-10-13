"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { message } from "antd";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";

export type CustomsInvoiceLineItem = interfaces.CustomsInvoiceLineItem;

const CUSTOMS_INVOICING_KEY = "customs-invoicing";

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

// The Invoicing tab of a shipment in Customs. Writes put the server's answer straight into
// the cache rather than refetching, so a save never resets fields still being typed in.
export const useCustomsInvoicing = (shipmentId: string) => {
  const queryClient = useQueryClient();
  const key = [CUSTOMS_INVOICING_KEY, shipmentId];

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.invoicing.customsInvoicingGet(shipmentId),
    enabled: !!shipmentId,
  });

  const patch = (fn: (data: interfaces.CustomsInvoicingItem) => interfaces.CustomsInvoicingItem) =>
    queryClient.setQueryData<interfaces.CustomsInvoicingItem>(key, (data) => (data ? fn(data) : data));

  const addLine = useMutation({
    mutationFn: (params: controllers.AddCustomsLineRequest) => api.invoicing.customsInvoicingAddLine(shipmentId, params),
    onSuccess: ({ line }) => patch((d) => ({ ...d, lines: [...d.lines, line] })),
    onError: (e) => message.error(errorText(e, "Could not add the line")),
  });

  const updateLine = useMutation({
    mutationFn: ({ id, ...params }: controllers.UpdateCustomsLineRequest & { id: string }) =>
      api.invoicing.customsInvoicingUpdateLine(shipmentId, id, params),
    onSuccess: ({ line }) => patch((d) => ({ ...d, lines: d.lines.map((l) => (l.id === line.id ? line : l)) })),
    onError: (e) => message.error(errorText(e, "Could not save the line")),
  });

  const deleteLine = useMutation({
    mutationFn: (id: string) => api.invoicing.customsInvoicingDeleteLine(shipmentId, id),
    onSuccess: (_res, id) => patch((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== id) })),
    onError: (e) => message.error(errorText(e, "Could not delete the line")),
  });

  const setNumber = useMutation({
    mutationFn: (issuedInvoiceNumber: string) => api.invoicing.customsInvoicingSetNumber(shipmentId, { issuedInvoiceNumber }),
    onSuccess: ({ issuedInvoiceNumber }) => patch((d) => ({ ...d, issuedInvoiceNumber })),
    onError: (e) => message.error(errorText(e, "Could not save the invoice number")),
  });

  return {
    lines: query.data?.lines ?? [],
    issuedInvoiceNumber: query.data?.issuedInvoiceNumber ?? "",
    isLoading: query.isLoading,
    addLine: addLine.mutate,
    isAdding: addLine.isPending,
    updateLine: updateLine.mutateAsync,
    deleteLine: deleteLine.mutate,
    setIssuedInvoiceNumber: setNumber.mutateAsync,
  };
};
