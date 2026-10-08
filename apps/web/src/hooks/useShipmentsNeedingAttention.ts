"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api";

export type ShipmentDueItem = interfaces.ShipmentDueItem;

// Kept outside the ["shipments"] key family: that one is rewritten optimistically as lists.
export const NEEDS_ATTENTION_KEY = ["shipments-needs-attention"];

/**
 * Active shipments with a deadline within 24 hours (today or tomorrow) and within
 * 48 hours (the day after). Computed server-side over the whole company dataset, so
 * the lists do not depend on the grid's search or filters.
 */
export const useShipmentsNeedingAttention = () => {
  const query = useQuery({
    queryKey: NEEDS_ATTENTION_KEY,
    queryFn: () => api.shipments.shipmentNeedsAttention(),
    // Deadlines move with the clock as well as with edits.
    refetchInterval: 60_000,
  });

  return {
    within24h: query.data?.within24h ?? [],
    within48h: query.data?.within48h ?? [],
    isLoading: query.isLoading,
    // A failed load must not read as "nothing due".
    isError: query.isError && !query.data,
  };
};
