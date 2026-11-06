"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";

export type TrackingAttentionItem = interfaces.TrackingAttentionItem;
export type TrackingAttentionFlag = interfaces.TrackingAttentionFlag;

/** Kept outside the ["shipments"] key family, as Needs Attention is. */
export const TRACKING_ATTENTION_KEY = ["shipments-tracking-attention"] as const;

/** Active shipments whose dates need a look. Worked out on the server over the whole company. */
export function useTrackingAttention() {
  const query = useQuery({
    queryKey: TRACKING_ATTENTION_KEY,
    queryFn: () => api.shipments.shipmentTrackingAttention(),
    // What is late moves with the clock as well as with edits.
    refetchInterval: 60_000,
  });
  return {
    items: query.data?.items ?? [],
    capped: query.data?.capped ?? false,
    isLoading: query.isLoading,
    // A failed load must not read as "nothing to chase".
    isError: query.isError && !query.data,
  };
}
