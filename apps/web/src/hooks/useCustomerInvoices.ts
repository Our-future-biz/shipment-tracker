"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";

export type InvoiceItem = interfaces.InvoiceItem;

export const useCustomerInvoices = (customerId: string) => {
  const queryClient = useQueryClient();
  const key = ["customer-invoices", customerId];

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.customers.invoiceList(customerId),
    enabled: !!customerId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createMutation = useMutation({
    mutationFn: (params: controllers.InvoiceCreateRequest) => api.customers.invoiceCreate(customerId, params),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, params }: { id: string; params: controllers.InvoiceUpdateRequest }) =>
      api.customers.invoiceUpdate(id, params),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.customers.invoiceDelete(id),
    onSuccess: invalidate,
  });

  return {
    invoices: query.data?.data ?? [],
    isLoading: query.isLoading,
    createInvoice: createMutation.mutateAsync,
    updateInvoice: updateMutation.mutateAsync,
    deleteInvoice: deleteMutation.mutateAsync,
  };
};
