"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces, services } from "@/lib/api/client";

// Shipping lines' ocean tariffs (Tariffs → Shipping Lines): the lines, their tariffs and versions,
// one version's layout, findings, ports and rates, a manager's actions on a draft, and the offers
// Sales asks for on a Sea FCL quote.

export type ShippingLineItem = services.ShippingLineItem;
export type ShippingLineDetail = services.ShippingLineDetail;
export type OceanTariffItem = services.OceanTariffItem;
export type OceanTariffVersionDetail = services.OceanTariffVersionDetail;
export type OceanLayout = interfaces.OceanLayout;
export type OceanPort = interfaces.OceanPort;
export type OceanRateView = services.OceanRateView;
export type OceanOffer = interfaces.OceanOffer;
export type OceanOffersResult = services.OceanOffersResult;
export type OceanUpload = controllers.OceanUploadRequest;
export type OceanOffersRequest = controllers.OceanOffersRequest;
/** A port name of a draft and what it means, with the version's id */
export type OceanPortSet = controllers.OceanPortSetRequest & { id: string };
/** A tariff's name and directions, with the tariff's id */
export type OceanTariffUpdate = controllers.OceanTariffUpdateRequest & { id: string };

export interface OceanRateFilter {
  search: string;
  /** One table by its index; null for all */
  table: number | null;
  offset: number;
  limit: number;
}

export const oceanTariffKeys = {
  all: ["ocean-tariffs"] as const,
  lines: () => [...oceanTariffKeys.all, "lines"] as const,
  line: (customerId: string) => [...oceanTariffKeys.all, "line", customerId] as const,
  version: (id: string) => [...oceanTariffKeys.all, "version", id] as const,
  rates: (id: string, filter: OceanRateFilter) => [...oceanTariffKeys.all, "rates", id, filter] as const,
  offers: (req: OceanOffersRequest) => [...oceanTariffKeys.all, "offers", req] as const,
};

export const useShippingLines = () => {
  const query = useQuery({ queryKey: oceanTariffKeys.lines(), queryFn: () => api.tariffs.shippingLineList() });
  return { lines: query.data?.lines ?? [], isLoading: query.isLoading, error: query.error };
};

export const useShippingLine = (customerId: string) => {
  const query = useQuery({ queryKey: oceanTariffKeys.line(customerId), queryFn: () => api.tariffs.shippingLineGet(customerId), enabled: !!customerId });
  return { detail: query.data ?? null, isLoading: query.isLoading, error: query.error };
};

export const useOceanTariffVersion = (id: string) => {
  const query = useQuery({ queryKey: oceanTariffKeys.version(id), queryFn: () => api.tariffs.oceanVersionGet(id).then((r) => r.version), enabled: !!id });
  return { version: query.data ?? null, isLoading: query.isLoading, error: query.error };
};

// A page of a version's rates; the last page stays shown while the next one loads.
export const useOceanRates = (id: string, filter: OceanRateFilter) => {
  const query = useQuery({
    queryKey: oceanTariffKeys.rates(id, filter),
    queryFn: () =>
      api.tariffs.oceanVersionRates(id, {
        search: filter.search || undefined,
        table: filter.table ?? undefined,
        offset: filter.offset,
        limit: filter.limit,
      }),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
  return { page: query.data ?? null, isLoading: query.isLoading, isFetching: query.isFetching, error: query.error };
};

// Every shipping line's offer for a Sea FCL quote (Sales → Pricing): nothing is asked while `req` is
// null. The last answer stays shown while a changed route is asked again.
export const useOceanOffers = (req: OceanOffersRequest | null) => {
  const query = useQuery({
    queryKey: oceanTariffKeys.offers(req!),
    queryFn: () => api.tariffs.oceanOffers(req!),
    enabled: req !== null,
    placeholderData: keepPreviousData,
  });
  return { result: req ? (query.data ?? null) : null, isLoading: query.isLoading, isFetching: query.isFetching, error: query.error };
};

/** The file a version was read from. */
export const fetchOceanTariffSource = (id: string) => api.tariffs.oceanVersionSource(id).then((r) => r.file);

// The manager's actions. Each one refreshes every ocean query: a version's change shows on its
// line's page and in the lines list too.
export const useOceanTariffActions = () => {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: oceanTariffKeys.all });
  const keep = (version: OceanTariffVersionDetail) => {
    queryClient.setQueryData(oceanTariffKeys.version(version.id), version);
    void refresh();
    return version;
  };

  const upload = useMutation({ mutationFn: (req: OceanUpload) => api.tariffs.oceanUpload(req).then((r) => keep(r.version)) });
  const relayout = useMutation({
    mutationFn: ({ id, layout }: { id: string; layout: OceanLayout }) => api.tariffs.oceanVersionLayout(id, { layout }).then((r) => keep(r.version)),
  });
  const setPort = useMutation({ mutationFn: ({ id, ...req }: OceanPortSet) => api.tariffs.oceanVersionPort(id, req).then((r) => keep(r.version)) });
  const approve = useMutation({ mutationFn: (id: string) => api.tariffs.oceanVersionApprove(id).then((r) => keep(r.version)) });
  const discard = useMutation({ mutationFn: (id: string) => api.tariffs.oceanVersionDiscard(id), onSuccess: refresh });
  const update = useMutation({ mutationFn: ({ id, ...fields }: OceanTariffUpdate) => api.tariffs.oceanTariffUpdate(id, fields), onSuccess: refresh });

  return {
    upload: upload.mutateAsync,
    isUploading: upload.isPending,
    relayout: relayout.mutateAsync,
    isRelayouting: relayout.isPending,
    setPort: setPort.mutateAsync,
    isSettingPort: setPort.isPending,
    approve: approve.mutateAsync,
    isApproving: approve.isPending,
    discard: discard.mutateAsync,
    isDiscarding: discard.isPending,
    update: update.mutateAsync,
    isUpdating: update.isPending,
  };
};
