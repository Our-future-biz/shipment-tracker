"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api";
import { managersCockpitKey } from "./warehouseKeys";

export type ManagersCockpit = interfaces.WarehouseManagersCockpit;
export type CockpitRow = interfaces.CockpitRow;

/**
 * The managers' cockpit of the Warehouse Concept: tiles, the URGENT and ATTENTION cards, the
 * health and audit lines. Worked out on the server over every record of the company (Prague
 * day), refreshed every minute and after a gate event in this browser.
 */
export const useManagersCockpit = () => {
  const query = useQuery({
    queryKey: managersCockpitKey,
    queryFn: async () => (await api.warehouseConcept.warehouseManagersCockpit()).cockpit,
    // Clocks move with time as well as with stamps.
    refetchInterval: 60_000,
  });
  return {
    cockpit: query.data ?? null,
    isLoading: query.isLoading,
    // A failed load must not read as "nothing urgent".
    isError: query.isError && !query.data,
    error: query.error,
  };
};
