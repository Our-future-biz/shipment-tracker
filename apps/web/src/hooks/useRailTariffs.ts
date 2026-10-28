"use client";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { useSupplierTariffCache, useSupplierTariffOffers } from "./useSupplierTariffs";

// Rail operators' tariffs (Tariffs → Rail Operators): the operators, their tariffs and versions,
// one version's layout, findings and rows, and the manager's actions on a draft.

export type RailOperatorItem = interfaces.RailOperatorItem;
export type RailTariffItem = interfaces.RailTariffItem;
export type RailTariffVersionDetail = interfaces.SupplierTariffVersionDetail;
export type RailLayout = interfaces.RailLayout;
export type RailBand = interfaces.RailBand;
export type RailRate = interfaces.RailRate;
export type RailTariffUpload = controllers.RailTariffUploadRequest;
export type RailOffersRequest = controllers.RailOffersRequest;
/** A tariff's name, ports and directions, with the tariff's id */
export type RailTariffUpdate = controllers.RailTariffUpdateRequest & { id: string };

export interface RailRateFilter {
  search: string;
  via: string;
  offset: number;
  limit: number;
}

export const railTariffKeys = {
  all: ["rail-tariffs"] as const,
  operators: () => [...railTariffKeys.all, "operators"] as const,
  operator: (customerId: string) => [...railTariffKeys.all, "operator", customerId] as const,
  version: (id: string) => [...railTariffKeys.all, "version", id] as const,
  rates: (id: string, filter: RailRateFilter) => [...railTariffKeys.all, "rates", id, filter] as const,
  offers: (req: RailOffersRequest | null) => [...railTariffKeys.all, "offers", req] as const,
};

export const useRailOperators = () => {
  const query = useQuery({ queryKey: railTariffKeys.operators(), queryFn: () => api.tariffs.railOperatorList() });
  return { operators: query.data?.operators ?? [], isLoading: query.isLoading, error: query.error };
};

export const useRailOperator = (customerId: string) => {
  const query = useQuery({ queryKey: railTariffKeys.operator(customerId), queryFn: () => api.tariffs.railOperatorGet(customerId), enabled: !!customerId });
  return { detail: query.data ?? null, isLoading: query.isLoading, error: query.error };
};

export const useRailTariffVersion = (id: string) => {
  const query = useQuery({ queryKey: railTariffKeys.version(id), queryFn: () => api.tariffs.railTariffVersionGet(id).then((r) => r.version), enabled: !!id });
  return { version: query.data ?? null, isLoading: query.isLoading, error: query.error };
};

// A page of a version's rows; the last page stays shown while the next one loads.
export const useRailRates = (id: string, filter: RailRateFilter) => {
  const query = useQuery({
    queryKey: railTariffKeys.rates(id, filter),
    queryFn: () =>
      api.tariffs.railTariffRates(id, {
        search: filter.search || undefined,
        via: filter.via || undefined,
        offset: filter.offset,
        limit: filter.limit,
      }),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
  return { page: query.data ?? null, isLoading: query.isLoading, isFetching: query.isFetching, error: query.error };
};

// What the rail tariffs ask for a route (Sales → Pricing): nothing is asked while `req` is null.
export const useRailOffers = (req: RailOffersRequest | null) => useSupplierTariffOffers(railTariffKeys.offers(req), api.tariffs.railOffers, req);

/** The file a version was read from. */
export const fetchRailTariffSource = (id: string) => api.tariffs.railTariffSource(id).then((r) => r.file);

// The manager's actions. Each one refreshes every rail tariff query (useSupplierTariffCache).
export const useRailTariffActions = () => {
  const { refresh, keep } = useSupplierTariffCache<RailTariffVersionDetail>(railTariffKeys.all, railTariffKeys.version);

  const upload = useMutation({ mutationFn: (req: RailTariffUpload) => api.tariffs.railTariffUpload(req).then((r) => keep(r.version)) });
  const relayout = useMutation({
    mutationFn: ({ id, layout }: { id: string; layout: RailLayout }) => api.tariffs.railTariffLayout(id, { layout }).then((r) => keep(r.version)),
  });
  const approve = useMutation({ mutationFn: (id: string) => api.tariffs.railTariffApprove(id).then((r) => keep(r.version)) });
  const discard = useMutation({ mutationFn: (id: string) => api.tariffs.railTariffDiscard(id), onSuccess: refresh });
  const update = useMutation({ mutationFn: ({ id, ...fields }: RailTariffUpdate) => api.tariffs.railTariffUpdate(id, fields), onSuccess: refresh });

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
  };
};
