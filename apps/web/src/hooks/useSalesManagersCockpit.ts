"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api";
import { salesManagersKeys } from "@/hooks/salesQueryKeys";

export type SalesManagersCockpit = interfaces.SalesManagersCockpit;
export type SalesCockpitRow = interfaces.SalesCockpitRow;
export type SalesCockpitMode = interfaces.SalesCockpitMode;

/**
 * Sales → Managers: tiles and the URGENT and ATTENTION cards over the company's quotes and
 * follow-up tasks, for one freight mode or all. Worked out on the server (Prague day) and
 * refreshed every minute, as the Warehouse cockpit is.
 */
export const useSalesManagersCockpit = (mode: SalesCockpitMode, enabled: boolean) => {
  const query = useQuery({
    queryKey: salesManagersKeys.cockpitOf(mode),
    queryFn: async () => (await api.sales.salesManagersCockpit({ mode })).cockpit,
    enabled,
    // Clocks move with time as well as with edits.
    refetchInterval: 60_000,
  });
  return {
    cockpit: query.data ?? null,
    isLoading: query.isLoading,
    // A failed load must not read as "nothing urgent".
    isError: query.isError && !query.data,
  };
};
