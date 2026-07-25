"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";

export type NoteItem = interfaces.NoteItem;

export const useCustomerNotes = (customerId: string) => {
  const queryClient = useQueryClient();
  const key = ["customer-notes", customerId];

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.customers.noteList(customerId),
    enabled: !!customerId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createMutation = useMutation({
    mutationFn: (params: controllers.NoteCreateRequest) => api.customers.noteCreate(customerId, params),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.customers.noteDelete(id),
    onSuccess: invalidate,
  });

  return {
    notes: query.data?.data ?? [],
    isLoading: query.isLoading,
    createNote: createMutation.mutateAsync,
    deleteNote: deleteMutation.mutateAsync,
  };
};
