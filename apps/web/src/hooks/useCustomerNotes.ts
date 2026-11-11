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

  // The Customer Database list shows when the latest entry was made (Last contact): it is marked stale,
  // not read again now - it is the whole list, and it is not on screen while an entry is written.
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["customers"], refetchType: "none" });
    return queryClient.invalidateQueries({ queryKey: key });
  };

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
    // True only when the request failed and there is nothing to show.
    isError: query.isLoadingError,
    createNote: createMutation.mutateAsync,
    deleteNote: deleteMutation.mutateAsync,
  };
};
