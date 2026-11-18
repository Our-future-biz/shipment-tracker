"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Counts behind the Shipments overview tiles. Computed server-side over the whole
 * company dataset, so the numbers stay stable regardless of the active page,
 * search or column filters.
 */
export const useShipmentTileCounts = () => {
  const query = useQuery({
    queryKey: ["shipment-tile-counts"],
    queryFn: () => api.shipments.shipmentTileCounts(),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    // "Needs Attention" moves with the clock as the cards do (useShipmentsNeedingAttention):
    // refetched on the same minute, so the tile and its card do not drift on an open page.
    refetchInterval: 60_000,
  });

  return { counts: query.data, isLoading: query.isLoading, isError: query.isError };
};
