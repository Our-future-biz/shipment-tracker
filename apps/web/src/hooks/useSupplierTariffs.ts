"use client";

import { keepPreviousData, skipToken, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { interfaces } from "@/lib/api/client";

// What the suppliers' tariff hooks (useRailTariffs, useCollectionTariffs, useOceanTariffs) have in
// common: a version as a supplier's page lists it, the refresh after a manager's action, and the
// offers Sales asks for on a quote.

/** A tariff version as a supplier's page lists it; the summary is the same for every kind of tariff. */
export type SupplierTariffVersion = interfaces.SupplierTariffVersion;

// After a manager's action every query of the module is read again (`all`): a version's change
// shows on its supplier's page, in the suppliers list and in the offers on a quote too. `keep`
// first puts the version the server answered with in place, so its page shows it straight away.
export const useSupplierTariffCache = <V extends { id: string }>(all: QueryKey, versionKey: (id: string) => QueryKey) => {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: all });
  const keep = (version: V) => {
    queryClient.setQueryData(versionKey(version.id), version);
    void refresh();
    return version;
  };
  return { refresh, keep };
};

// What a module's tariffs offer for a quote (Sales → Pricing): nothing is asked while `req` is null.
// The last answer stays shown while a changed request is asked again.
export const useSupplierTariffOffers = <Req, Res>(queryKey: QueryKey, fetchOffers: (req: Req) => Promise<Res>, req: Req | null) => {
  const query = useQuery({
    queryKey,
    queryFn: req === null ? skipToken : () => fetchOffers(req),
    placeholderData: keepPreviousData,
  });
  return { result: req !== null ? (query.data ?? null) : null, isLoading: query.isLoading, isFetching: query.isFetching, error: query.error };
};
