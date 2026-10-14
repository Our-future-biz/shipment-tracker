"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * One shipment by id, straight from the API — the list only holds the newest rows, so a detail
 * page must not depend on it. Kept under ["shipments"], so every write that refreshes the
 * shipments refreshes this too (and useShipments' optimistic edit patches it).
 */
export const shipmentDetailKey = (id: string) => ["shipments", "detail", id];

export const useShipment = (id: string | undefined) => {
  const query = useQuery({
    queryKey: shipmentDetailKey(id ?? ""),
    queryFn: () => api.shipments.shipmentGet(id!),
    enabled: !!id,
  });
  return { shipment: query.data?.shipment, isLoading: query.isLoading, isError: query.isError };
};
