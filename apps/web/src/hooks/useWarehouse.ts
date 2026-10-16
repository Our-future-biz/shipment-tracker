"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers } from "@/lib/api/client";
import { gateKeys, warehouseImportKeys, warehouseTaskKeys } from "./warehouseKeys";

export const useWarehouse = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: warehouseTaskKeys.list(),
    queryFn: () => api.warehouseConcept.warehouseList({}),
  });

  const createMutation = useMutation({
    mutationFn: (params: controllers.WarehouseConceptCreateRequest) => api.warehouseConcept.warehouseCreate(params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: warehouseTaskKeys.all }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: controllers.WarehouseConceptUpdateRequest }) => api.warehouseConcept.warehouseUpdate(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: warehouseTaskKeys.all }),
  });

  // A position whose gate record has stamps is removed only by a manager with a reason; its gate
  // records are archived with it. The reason travels in the request body (not the URL).
  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => api.warehouseConcept.warehousePositionRemove(id, reason ? { reason } : {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: warehouseTaskKeys.all });
      queryClient.invalidateQueries({ queryKey: gateKeys.all });
    },
  });

  // Several shipments in one request; one result per shipment (created / already / failed).
  const importMutation = useMutation({
    mutationFn: (shipmentIds: string[]) => api.warehouseConcept.warehouseImport({ shipmentIds }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: warehouseTaskKeys.all });
      queryClient.invalidateQueries({ queryKey: gateKeys.all });
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

/** Shipments to copy a new position from (job search, debounced by the caller). */
export const useCopyJobSearch = (query: string, enabled: boolean) =>
  useQuery({
    queryKey: warehouseImportKeys.copyJobs(query),
    queryFn: () => api.shipments.shipmentList({ limit: 50, search: query || undefined }),
    enabled,
  });

/** Sales quotes to copy a new position from (newest first). */
export const useCopyQuotes = (enabled: boolean) =>
  useQuery({
    queryKey: warehouseImportKeys.copyQuotes(),
    queryFn: () => api.quotes.salesQuoteList({ limit: 200, sortDirection: "desc" }),
    enabled,
  });

/** A new position with its gate record; refreshes the positions and the Gate Log. */
export const useCreatePosition = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: controllers.WarehousePositionCreateRequest) => api.warehouseConcept.warehousePositionCreate(values),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: warehouseTaskKeys.all }),
        queryClient.invalidateQueries({ queryKey: gateKeys.all }),
      ]),
  });
};
