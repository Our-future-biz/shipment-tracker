"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";

export type DocumentItem = interfaces.DocumentItem;

export const useCustomerDocuments = (customerId: string) => {
  const queryClient = useQueryClient();
  const key = ["customer-documents", customerId];

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.customers.documentList(customerId),
    enabled: !!customerId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createMutation = useMutation({
    mutationFn: (params: controllers.DocumentCreateRequest) => api.customers.documentCreate(customerId, params),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.customers.documentDelete(id),
    onSuccess: invalidate,
  });

  return {
    documents: query.data?.data ?? [],
    isLoading: query.isLoading,
    createDocument: createMutation.mutateAsync,
    deleteDocument: deleteMutation.mutateAsync,
  };
};
