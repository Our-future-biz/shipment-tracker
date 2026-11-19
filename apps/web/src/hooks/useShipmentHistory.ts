"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";

/** A job's history (shipment_audit) as managers read it, page by page; every page under the job's key. */
export const shipmentHistoryKey = (shipmentId: string) => ["shipment-history", shipmentId] as const;

/** Entries a page: the server's default. */
const PAGE = 50;

/**
 * The job's history, newest first (GET /shipments/:id/history, managers only): the first page on opening,
 * each older one with "Load older" (`before` = the page before's `nextBefore`).
 */
export function useShipmentHistory(shipmentId: string, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: shipmentHistoryKey(shipmentId),
    queryFn: ({ pageParam }) => api.shipments.shipmentHistory(shipmentId, { limit: PAGE, ...(pageParam ? { before: pageParam } : {}) }),
    initialPageParam: "" as string,
    getNextPageParam: (last: interfaces.ShipmentHistoryPage) => last.nextBefore ?? undefined,
    enabled: enabled && !!shipmentId,
    // Read again each time the tab opens: a change made a moment ago on another tab belongs in it.
    staleTime: 0,
  });
  return {
    // Each page says whether its people's names could be read (namesKnown): its entries then carry the user ids only.
    pages: query.data?.pages ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    hasOlder: query.hasNextPage,
    loadOlder: query.fetchNextPage,
    loadingOlder: query.isFetchingNextPage,
  };
}
