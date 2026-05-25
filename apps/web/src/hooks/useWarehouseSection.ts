"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useWarehouseSection(shipmentId: string, section: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["warehouse-section", shipmentId, section],
    queryFn: () => api.warehouse.warehouseSectionGet(shipmentId, section),
    enabled: !!shipmentId,
  });

  const mutation = useMutation({
    mutationFn: (data: unknown) =>
      api.warehouse.warehouseSectionUpsert(shipmentId, section, { data }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["warehouse-section", shipmentId, section] }),
  });

  return {
    data: (query.data as { section: { data: unknown } | null } | undefined)?.section?.data ?? null,
    isLoading: query.isLoading,
    save: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
