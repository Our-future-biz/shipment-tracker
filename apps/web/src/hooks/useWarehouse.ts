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

  // A position whose gate record has stamps is removed only by a manager with a reason; its gate
  // records are archived with it. The reason travels in the request body (not the URL).
  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => api.warehouse.warehousePositionRemove(id, reason ? { reason } : {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-gate"] });
    },
  });

  // Several shipments in one request; one result per shipment (created / already / failed).
  const importMutation = useMutation({
    mutationFn: (shipmentIds: string[]) => api.warehouse.warehouseImport({ shipmentIds }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouse"] });
      queryClient.invalidateQueries({ queryKey: ["warehouse-gate"] });
    },
  });

  return {
    tasks: query.data?.tasks ?? [],
    isLoading: query.isLoading,
    createTask: createMutation.mutateAsync,
    updateTask: updateMutation.mutateAsync,
    deleteTask: deleteMutation.mutateAsync,
    importShipments: importMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
};
