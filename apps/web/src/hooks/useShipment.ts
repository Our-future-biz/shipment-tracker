"use client";

import { useQuery } from "@tanstack/react-query";
import { api, apiErrorMessage, isNotFound } from "@/lib/api";
import { isUuid } from "@/lib/uuid";
import type { ShipmentItem } from "./useShipments";

/**
 * One shipment by id. The list (useShipments) holds only the newest rows, so a shipment opened
 * by link — from a quote, a customer, a bookmark, the billing queue — may not be among them: it is
 * then read on its own. Kept under ["shipments"], so every write that refreshes the shipments
 * refreshes this too, and useShipments' optimistic edit patches it.
 */
export const shipmentDetailKey = (id: string) => ["shipments", "detail", id];

interface LoadedList {
  shipments: ShipmentItem[];
  isLoading: boolean;
}

/**
 * `list` is optional: a page that already holds a list passes it, and a shipment that is in it is
 * taken from there (following every edit made to that list) instead of being asked for again.
 */
export function useShipment(id: string | undefined, list?: LoadedList) {
  const listed = id && list ? list.shipments.find((shipment) => shipment.id === id) : undefined;
  // Anything else cannot name a shipment, and the server would answer it with an error of its own.
  const isId = !!id && isUuid(id);
  const query = useQuery({
    queryKey: shipmentDetailKey(id ?? ""),
    queryFn: () => api.shipments.shipmentGet(id!),
    enabled: isId && !list?.isLoading && !listed,
    // "Not found" is an answer, not a failure worth asking about again.
    retry: (failures, err) => !isNotFound(err) && failures < 1,
  });

  // Only the server's word that there is no such shipment makes it "not found": a request that
  // failed for another reason says nothing about the shipment.
  const notFound = !!id && (!isId || (!listed && isNotFound(query.error)));
  const shipment = notFound ? undefined : (listed ?? query.data?.shipment);

  return {
    shipment,
    isLoading: !!id && !notFound && !shipment && (!!list?.isLoading || query.isPending),
    notFound,
    isError: !shipment && !notFound && query.isError,
    /** Why the shipment could not be read, when that is not because it does not exist. */
    error: !shipment && !notFound && query.isError ? apiErrorMessage(query.error) : null,
    reload: query.refetch,
  };
}
