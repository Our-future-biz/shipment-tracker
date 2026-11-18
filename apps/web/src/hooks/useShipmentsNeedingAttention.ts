"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api";

export type ShipmentDueItem = interfaces.ShipmentDueItem;

// Kept outside the ["shipments"] key family: that one is rewritten optimistically as lists.
export const NEEDS_ATTENTION_KEY = ["shipments-needs-attention"];

const NOTHING: string[] = [];

/**
 * Active shipments with something due: URGENT (`within24h` - today or the next working day, and
 * every cut-off missed or overdue) and the two working days after (`within48h`), on the deadline
 * rules of Shipments → Managers. Computed server-side over the whole company dataset, so the
 * lists do not depend on the grid's search or filters.
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
    /** The company has more jobs with dates around today than were read: the lists may miss some. */
    capped: query.data?.capped ?? false,
    /** False when the company's own holidays could not be read. Known until the answer says otherwise. */
    holidaysKnown: query.data?.holidaysKnown ?? true,
    /** What could not be read, in the words to show. */
    notKnown: query.data?.notKnown ?? NOTHING,
    isLoading: query.isLoading,
    // A failed load must not read as "nothing due".
    isError: query.isError && !query.data,
  };
};
