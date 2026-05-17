"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers } from "@/lib/api/client";

export const useWarehouse = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["warehouse"],
    queryFn: () => api.warehouse.warehouseList({}),
  });

  const createMutation = useMutation({
    mutationFn: (params: controllers.WarehouseCreateRequest) => api.warehouse.warehouseCreate(params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["warehouse"] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: controllers.WarehouseUpdateRequest }) => api.warehouse.warehouseUpdate(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["warehouse"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.warehouse.warehouseDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["warehouse"] }),
  });

  return {
    tasks: query.data?.tasks ?? [],
    isLoading: query.isLoading,
    createTask: createMutation.mutateAsync,
    updateTask: updateMutation.mutateAsync,
    deleteTask: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
};
