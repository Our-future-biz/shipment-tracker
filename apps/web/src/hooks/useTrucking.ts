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
/**
 * The rating of `req`, as a query: nothing is asked while `req` is null. `round` changes on every
 * opening of the dialog that shows it, so each opening rates the request as it is now.
 */
export function useRateQuery(req: RateRequest | null, round: number) {
  const query = useQuery({
    queryKey: truckingKeys.rate(req, round),
    queryFn: () => api.trucking.truckingRate(req as RateRequest),
    enabled: !!req,
    retry: false,
    staleTime: Infinity,
  });
  return { result: query.data ?? null, isRating: query.isFetching, error: query.error };
}

export function useRate() {
  const rate = useMutation({ mutationFn: (req: RateRequest) => api.trucking.truckingRate(req) });
  return { rate: rate.mutateAsync, isRating: rate.isPending, result: rate.data ?? null, error: rate.error, reset: rate.reset };
}

// The Excel template, upload, comparison and test lane of tariff versions (Phase 2b).

export type FileDownload = Awaited<ReturnType<typeof api.trucking.truckingTariffTemplate>>["file"];
export type TariffImportResult = Awaited<ReturnType<typeof api.trucking.truckingTariffImport>>;
export type ImportSheetReport = TariffImportResult["sheets"][number];
export type TariffVersionDiff = Awaited<ReturnType<typeof api.trucking.truckingTariffVersionDiff>>["diff"];
export type DiffCell = TariffVersionDiff["cells"][number];
export type TestLaneRequest = Parameters<typeof api.trucking.truckingTariffVersionTestLane>[1];
export type TestLaneLevel = Awaited<ReturnType<typeof api.trucking.truckingTariffVersionTestLane>>["levels"][number];

/** The template of a tariff: the given version exported, by default the active one, or the empty template. Fetched on click. */
export const fetchTariffTemplate = async (tariffId: string, versionId?: string): Promise<FileDownload> =>
  (await api.trucking.truckingTariffTemplate(tariffId, { versionId })).file;

/** The file a version was uploaded from. Fetched on click. */
export const fetchTariffVersionSource = async (versionId: string): Promise<FileDownload> => (await api.trucking.truckingTariffVersionSource(versionId)).file;

/** Uploads a price list (manager): the server saves it as a new draft, so the tariff is refreshed. */
export function useTariffImport(tariffId: string) {
  const queryClient = useQueryClient();
  const upload = useMutation({
    mutationFn: (req: Parameters<typeof api.trucking.truckingTariffImport>[1]) => api.trucking.truckingTariffImport(tariffId, req),
    onSuccess: (res) => {
      queryClient.setQueryData(truckingKeys.tariffVersion(res.version.id), { version: res.version });
      return queryClient.invalidateQueries({ queryKey: truckingKeys.tariff(tariffId) });
    },
  });
  return { upload: upload.mutateAsync, isUploading: upload.isPending, error: upload.error, reset: upload.reset };
}

/** What a version changes against another one (by default the tariff's active version). */
export function useTariffVersionDiff(versionId: string | null, againstVersionId?: string) {
  const query = useQuery({
    queryKey: truckingKeys.tariffVersionDiff(versionId ?? "", againstVersionId ?? "active"),
    queryFn: () => api.trucking.truckingTariffVersionDiff(versionId as string, { againstVersionId }),
    enabled: !!versionId,
    retry: false,
  });
  return { diff: query.data?.diff ?? null, isLoading: query.isLoading, error: query.error };
}

/** Prices one lane with one version; nothing is stored. */
export function useTariffTestLane(versionId: string) {
  const test = useMutation({ mutationFn: (req: TestLaneRequest) => api.trucking.truckingTariffVersionTestLane(versionId, req) });
  return { testLane: test.mutateAsync, isTesting: test.isPending, levels: test.data?.levels ?? null, error: test.error };
}

export type PortalUser = interfaces.PortalUserItem;
export type PortalUserCreate = Parameters<typeof api.trucking.truckingPortalUserCreate>[1];

/**
 * The haulier's portal users. Adding one and resetting a password answer with a one-time link the
 * caller shows once and then forgets; nothing here keeps it.
 */
export function usePortalUsers(customerId: string) {
  const queryClient = useQueryClient();
  const key = truckingKeys.portalUsers(customerId);
  const query = useQuery({ queryKey: key, queryFn: () => api.trucking.truckingPortalUserList(customerId), enabled: !!customerId, retry: false });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const create = useMutation({ mutationFn: (req: PortalUserCreate) => api.trucking.truckingPortalUserCreate(customerId, req), onSuccess: refresh });
  const reset = useMutation({ mutationFn: (id: string) => api.trucking.truckingPortalUserReset(id), onSuccess: refresh });
  const disable = useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => api.trucking.truckingPortalUserDisable(id, { reason }), onSuccess: refresh });
  const enable = useMutation({ mutationFn: (id: string) => api.trucking.truckingPortalUserEnable(id), onSuccess: refresh });

  return {
    users: query.data?.users ?? [],
    isLoading: query.isLoading,
    error: query.error,
    create: create.mutateAsync,
    isCreating: create.isPending,
    reset: reset.mutateAsync,
    isResetting: reset.isPending,
    disable: disable.mutateAsync,
    isDisabling: disable.isPending,
    enable: enable.mutateAsync,
    isEnabling: enable.isPending,
  };
}
