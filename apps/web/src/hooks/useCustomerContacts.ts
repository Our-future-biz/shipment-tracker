"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";

export type ContactItem = interfaces.ContactItem;

export const useCustomerContacts = (customerId: string) => {
  const queryClient = useQueryClient();
  const key = ["customer-contacts", customerId];

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.customers.contactList(customerId),
    enabled: !!customerId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createMutation = useMutation({
    mutationFn: (params: controllers.ContactCreateRequest) => api.customers.contactCreate(customerId, params),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, params }: { id: string; params: Omit<controllers.ContactUpdateRequest, "customerId"> }) =>
      api.customers.contactUpdate(id, { ...params, customerId }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.customers.contactDelete(id),
    onSuccess: invalidate,
  });

  return {
    contacts: query.data?.data ?? [],
    isLoading: query.isLoading,
    createContact: createMutation.mutateAsync,
    updateContact: updateMutation.mutateAsync,
    deleteContact: deleteMutation.mutateAsync,
  };
};
