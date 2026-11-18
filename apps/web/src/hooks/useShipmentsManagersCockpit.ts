"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api";

export type ShipmentsManagersCockpit = interfaces.ShipmentsManagersCockpit;
export type OpsCockpitRow = interfaces.OpsCockpitRow;
export type OpsCockpitMode = interfaces.OpsCockpitMode;
export type OpsCockpitDirection = interfaces.OpsCockpitDirection;
export type OpsCockpitPerson = interfaces.OpsCockpitPerson;
export type OpsCockpitTiles = interfaces.OpsCockpitTiles;

/** Which jobs the cockpit counts: `handledBy` is an e-mail, "nobody", or null for everyone. */
export interface OpsCockpitFilter {
  mode: OpsCockpitMode;
  direction: OpsCockpitDirection;
  handledBy: string | null;
}

// Not under "shipments": the shipment hooks read every cache there as a list of shipments.
const cockpitKey = ({ mode, direction, handledBy }: OpsCockpitFilter) => ["shipments-managers-cockpit", mode, direction, handledBy] as const;

/**
 * Shipments → Managers: tiles, the URGENT and ATTENTION cards and the people named in Handled By,
 * over the company's active jobs of one mode, direction and person, or all of them. Worked out on
 * the server (Prague day) and refreshed every minute, as the Sales and Warehouse cockpits are.
 */
export const useShipmentsManagersCockpit = (filter: OpsCockpitFilter, enabled: boolean) => {
  const query = useQuery({
    queryKey: cockpitKey(filter),
    queryFn: async () => (await api.shipments.shipmentManagersCockpit({ mode: filter.mode, direction: filter.direction, handledBy: filter.handledBy ?? undefined })).cockpit,
    enabled,
    // Clocks move with time as well as with edits.
    refetchInterval: 60_000,
    // Coming back from a job just put right, the figures are read again at once (the app's queries
    // otherwise trust an answer for a minute); what was there shows until the new answer arrives.
    staleTime: 0,
    // Kept only for `people`: the Handled By select is filled from the answer, and must not lose
    // its names each time a filter is changed.
    placeholderData: keepPreviousData,
  });
  // The answer to an earlier filter is not this filter's: its figures stay off the screen.
  const waiting = query.isPlaceholderData;
  return {
    cockpit: waiting ? null : (query.data ?? null),
    /** Who the Handled By filter is picked from; the earlier answer's while the next one loads. */
    people: query.data?.people ?? [],
    isLoading: query.isLoading || waiting,
    // A failed load must not read as "nothing urgent".
    isError: query.isError && !query.data,
  };
};
