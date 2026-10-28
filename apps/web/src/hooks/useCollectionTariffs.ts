"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces, services } from "@/lib/api/client";

// First / last mile hauliers' tariffs (Tariffs → Last / First Mile Collections): the hauliers, their
// tariffs and versions, one version's layout, findings and tables, our hubs, a manager's actions on
// a draft, and the offers Sales asks for on an LCL or air quote.

export type CollectionHaulierItem = interfaces.CollectionHaulierItem;
export type CollectionHaulierDetail = services.CollectionHaulierDetail;
export type CollectionTariffItem = interfaces.CollectionTariffItem;
export type CollectionTariffVersionDetail = interfaces.CollectionTariffVersionDetail;
export type CollectionLayout = interfaces.CollectionLayout;
export type CollectionHub = interfaces.CollectionHub;
export type CollectionFreightMode = interfaces.CollectionFreightMode;
export type CollectionTry = interfaces.CollectionTry;
export type CollectionOffer = interfaces.CollectionOffer;
export type CollectionOffersResult = services.CollectionOffersResult;
export type CollectionUpload = controllers.CollectionUploadRequest;
export type CollectionOffersRequest = controllers.CollectionOffersRequest;
/** A version tried between two postcodes, with the version's id */
export type CollectionTryRequest = controllers.CollectionTryRequest & { id: string };
/** A tariff's name and freight, with the tariff's id */
export type CollectionTariffUpdate = controllers.CollectionTariffUpdateRequest & { id: string };

export const collectionTariffKeys = {
  all: ["collection-tariffs"] as const,
  hauliers: () => [...collectionTariffKeys.all, "hauliers"] as const,
  haulier: (customerId: string) => [...collectionTariffKeys.all, "haulier", customerId] as const,
  version: (id: string) => [...collectionTariffKeys.all, "version", id] as const,
  hubs: () => [...collectionTariffKeys.all, "hubs"] as const,
  offers: (req: CollectionOffersRequest) => [...collectionTariffKeys.all, "offers", req] as const,
};

export const useCollectionHauliers = () => {
  const query = useQuery({ queryKey: collectionTariffKeys.hauliers(), queryFn: () => api.tariffs.collectionHaulierList() });
  return { hauliers: query.data?.hauliers ?? [], isLoading: query.isLoading, error: query.error };
};

export const useCollectionHaulier = (customerId: string) => {
  const query = useQuery({ queryKey: collectionTariffKeys.haulier(customerId), queryFn: () => api.tariffs.collectionHaulierGet(customerId), enabled: !!customerId });
  return { detail: query.data ?? null, isLoading: query.isLoading, error: query.error };
};

export const useCollectionTariffVersion = (id: string) => {
  const query = useQuery({ queryKey: collectionTariffKeys.version(id), queryFn: () => api.tariffs.collectionVersionGet(id).then((r) => r.version), enabled: !!id });
  return { version: query.data ?? null, isLoading: query.isLoading, error: query.error };
};

/** Our hubs, one per freight mode that has one. */
export const useCollectionHubs = () => {
  const query = useQuery({ queryKey: collectionTariffKeys.hubs(), queryFn: () => api.tariffs.collectionHubList().then((r) => r.hubs) });
  return { hubs: query.data ?? [], isLoading: query.isLoading, error: query.error };
};

// Every haulier's price for a consignment (Sales → Pricing): nothing is asked while `req` is null.
// The last answer stays shown while a changed consignment is asked again.
export const useCollectionOffers = (req: CollectionOffersRequest | null) => {
  const query = useQuery({
    queryKey: collectionTariffKeys.offers(req!),
    queryFn: () => api.tariffs.collectionOffers(req!),
    enabled: req !== null,
    placeholderData: keepPreviousData,
  });
  return { result: req ? (query.data ?? null) : null, isLoading: query.isLoading, isFetching: query.isFetching, error: query.error };
};

/** The file a version was read from. */
export const fetchCollectionTariffSource = (id: string) => api.tariffs.collectionVersionSource(id).then((r) => r.file);

// The manager's actions. Each one refreshes every collections query: a version's change shows on
// its haulier's page and in the hauliers list too.
export const useCollectionTariffActions = () => {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: collectionTariffKeys.all });
  const keep = (version: CollectionTariffVersionDetail) => {
    queryClient.setQueryData(collectionTariffKeys.version(version.id), version);
    void refresh();
    return version;
  };

  const upload = useMutation({ mutationFn: (req: CollectionUpload) => api.tariffs.collectionUpload(req).then((r) => keep(r.version)) });
  const relayout = useMutation({
    mutationFn: ({ id, layout }: { id: string; layout: CollectionLayout }) => api.tariffs.collectionVersionLayout(id, { layout }).then((r) => keep(r.version)),
  });
  const approve = useMutation({ mutationFn: (id: string) => api.tariffs.collectionVersionApprove(id).then((r) => keep(r.version)) });
  const discard = useMutation({ mutationFn: (id: string) => api.tariffs.collectionVersionDiscard(id), onSuccess: refresh });
  const update = useMutation({ mutationFn: ({ id, ...fields }: CollectionTariffUpdate) => api.tariffs.collectionTariffUpdate(id, fields), onSuccess: refresh });
  const setHub = useMutation({ mutationFn: (hub: CollectionHub) => api.tariffs.collectionHubSet(hub), onSuccess: refresh });
  const tryRoute = useMutation({ mutationFn: ({ id, ...route }: CollectionTryRequest) => api.tariffs.collectionVersionTry(id, route) });

  return {
    upload: upload.mutateAsync,
    isUploading: upload.isPending,
    relayout: relayout.mutateAsync,
    isRelayouting: relayout.isPending,
    approve: approve.mutateAsync,
    isApproving: approve.isPending,
    discard: discard.mutateAsync,
    isDiscarding: discard.isPending,
    update: update.mutateAsync,
    isUpdating: update.isPending,
    setHub: setHub.mutateAsync,
    isSettingHub: setHub.isPending,
    tryRoute: tryRoute.mutateAsync,
    isTrying: tryRoute.isPending,
  };
};
