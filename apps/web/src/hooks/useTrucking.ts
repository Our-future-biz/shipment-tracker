"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { truckingKeys } from "./truckingKeys";

// Trucking settings and hauliers (Phase 1). Request shapes are taken from the client methods, so
// they follow the API when the client is regenerated.

export type TruckingSettings = interfaces.TruckingSettings;
export type TruckingSettingsUpdate = Parameters<typeof api.trucking.truckingSettingsUpdate>[0];
export type HaulierListItem = interfaces.HaulierListItem;
export type HaulierDetail = interfaces.HaulierDetail;
export type HaulierUpdate = Parameters<typeof api.trucking.truckingHaulierUpdate>[1];

export function useTruckingSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: truckingKeys.settings(),
    queryFn: () => api.trucking.truckingSettingsGet(),
    staleTime: 30_000,
  });

  const update = useMutation({
    mutationFn: (req: TruckingSettingsUpdate) => api.trucking.truckingSettingsUpdate(req),
    onSuccess: (res) => queryClient.setQueryData(truckingKeys.settings(), res),
  });

  return {
    settings: query.data?.settings ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    reload: query.refetch,
    save: update.mutateAsync,
    isSaving: update.isPending,
  };
}

const NO_HAULIERS: HaulierListItem[] = [];

export function useHauliers() {
  const query = useQuery({
    queryKey: truckingKeys.haulierList(),
    queryFn: () => api.trucking.truckingHaulierList({}),
  });
  return {
    hauliers: query.data?.hauliers ?? NO_HAULIERS,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/** One haulier with its profile; `enabled: false` asks nothing (a customer who is not a haulier). */
export function useHaulier(customerId: string, { enabled = true } = {}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: truckingKeys.haulier(customerId),
    queryFn: () => api.trucking.truckingHaulierGet(customerId),
    enabled: enabled && !!customerId,
    retry: false,
  });

  // Every change answers with the haulier as stored now; the list shows its status, so it is refreshed too.
  const onChanged = (res: { haulier: HaulierDetail }) => {
    queryClient.setQueryData(truckingKeys.haulier(customerId), res);
    return queryClient.invalidateQueries({ queryKey: truckingKeys.haulierList() });
  };

  const update = useMutation({
    mutationFn: (req: HaulierUpdate) => api.trucking.truckingHaulierUpdate(customerId, req),
    onSuccess: onChanged,
  });
  const block = useMutation({
    mutationFn: (reason: string) => api.trucking.truckingHaulierBlock(customerId, { reason }),
    onSuccess: onChanged,
  });
  const unblock = useMutation({
    mutationFn: (reason: string) => api.trucking.truckingHaulierUnblock(customerId, { reason }),
    onSuccess: onChanged,
  });

  return {
    haulier: query.data?.haulier ?? null,
    isLoading: query.isLoading,
    error: query.error,
    reload: query.refetch,
    save: update.mutateAsync,
    isSaving: update.isPending,
    block: block.mutateAsync,
    unblock: unblock.mutateAsync,
    isBlocking: block.isPending || unblock.isPending,
  };
}
