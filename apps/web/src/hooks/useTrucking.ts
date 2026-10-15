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

// Tariffs, fuel index and the rate calculator (Phase 2a).

export type TariffSide = interfaces.TariffSide;
export type TariffListItem = interfaces.TariffListItem;
export type TariffDetail = interfaces.TariffDetail;
export type TariffVersionSummary = interfaces.TariffVersionSummary;
export type TariffVersionDetail = interfaces.TariffVersionDetail;
export type TariffCreate = Parameters<typeof api.trucking.truckingTariffCreate>[0];
export type TariffUpdate = Parameters<typeof api.trucking.truckingTariffUpdate>[1];
export type FuelIndexSet = Parameters<typeof api.trucking.truckingFuelIndexSet>[0];
export type FuelIndexMonth = Awaited<ReturnType<typeof api.trucking.truckingFuelIndexList>>["months"][number];
export type RateRequest = Parameters<typeof api.trucking.truckingRate>[0];
export type RateResponse = Awaited<ReturnType<typeof api.trucking.truckingRate>>;
export type RateLevelResult = RateResponse["results"][number];

const NO_TARIFFS: TariffListItem[] = [];

/** Every tariff of the company (all sides: a few dozen at most); the tab filters by side. */
export function useTariffs() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: truckingKeys.tariffList(),
    queryFn: () => api.trucking.truckingTariffList({}),
  });
  const create = useMutation({
    mutationFn: (req: TariffCreate) => api.trucking.truckingTariffCreate(req),
    onSuccess: (res) => {
      queryClient.setQueryData(truckingKeys.tariff(res.tariff.id), res);
      return queryClient.invalidateQueries({ queryKey: truckingKeys.tariffList() });
    },
  });
  return {
    tariffs: query.data?.tariffs ?? NO_TARIFFS,
    isLoading: query.isLoading,
    isError: query.isError,
    create: create.mutateAsync,
    isCreating: create.isPending,
  };
}

/** One tariff with its versions, and what a manager does with them. */
export function useTariff(id: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: truckingKeys.tariff(id),
    queryFn: () => api.trucking.truckingTariffGet(id),
    enabled: !!id,
    retry: false,
  });

  // A version change moves the statuses of the others too (the previous one gets its end date),
  // so the tariff, the list and every version read are refreshed.
  const refresh = () => queryClient.invalidateQueries({ queryKey: truckingKeys.tariffs() });

  const update = useMutation({
    mutationFn: (req: TariffUpdate) => api.trucking.truckingTariffUpdate(id, req),
    onSuccess: (res) => {
      queryClient.setQueryData(truckingKeys.tariff(id), res);
      return queryClient.invalidateQueries({ queryKey: truckingKeys.tariffList() });
    },
  });
  const activate = useMutation({
    mutationFn: ({ versionId, validFrom }: { versionId: string; validFrom: string }) => api.trucking.truckingTariffVersionActivate(versionId, { validFrom }),
    onSuccess: refresh,
  });
  const discard = useMutation({
    mutationFn: (versionId: string) => api.trucking.truckingTariffVersionDiscard(versionId),
    onSuccess: refresh,
  });

  return {
    tariff: query.data?.tariff ?? null,
    isLoading: query.isLoading,
    error: query.error,
    save: update.mutateAsync,
    isSaving: update.isPending,
    activate: activate.mutateAsync,
    isActivating: activate.isPending,
    discard: discard.mutateAsync,
    isDiscarding: discard.isPending,
  };
}

/** One tariff version with its content and findings; `enabled: false` asks nothing. */
export function useTariffVersion(versionId: string | null, { enabled = true } = {}) {
  const query = useQuery({
    queryKey: truckingKeys.tariffVersion(versionId ?? ""),
    queryFn: () => api.trucking.truckingTariffVersionGet(versionId as string),
    enabled: enabled && !!versionId,
    retry: false,
  });
  return { version: query.data?.version ?? null, isLoading: query.isLoading, error: query.error };
}

const NO_MONTHS: FuelIndexMonth[] = [];

export function useFuelIndex() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: truckingKeys.fuelIndex(),
    queryFn: () => api.trucking.truckingFuelIndexList(),
  });
  const set = useMutation({
    mutationFn: (req: FuelIndexSet) => api.trucking.truckingFuelIndexSet(req),
    onSuccess: (res) => queryClient.setQueryData(truckingKeys.fuelIndex(), res),
  });
  return {
    months: query.data?.months ?? NO_MONTHS,
    isLoading: query.isLoading,
    isError: query.isError,
    setMonth: set.mutateAsync,
    isSetting: set.isPending,
  };
}

/** Prices a consignment; nothing is stored, so it is a mutation the calculator calls on demand. */
export function useRate() {
  const rate = useMutation({ mutationFn: (req: RateRequest) => api.trucking.truckingRate(req) });
  return { rate: rate.mutateAsync, isRating: rate.isPending, result: rate.data ?? null, error: rate.error, reset: rate.reset };
}
