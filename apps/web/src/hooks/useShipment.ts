"use client";

import { useQuery } from "@tanstack/react-query";
import { api, apiErrorMessage, isNotFound } from "@/lib/api";
import { isUuid } from "@/lib/uuid";
import type { ShipmentItem } from "./useShipments";

// One shipment by its id, for a page that shows it. A loaded list (useShipments) holds only the
// newest rows, so a shipment opened by link - from a quote, a customer, a bookmark - may not be
// among them: it is then read on its own. `list` is the caller's own list, so the page of a
// shipment that is in it asks for nothing more and follows every edit made to that list.
//
// The shipment read on its own is kept under ["shipments", "one", id] - the key the Customs
// section reads an opened shipment under - so every write that refreshes ["shipments"] refreshes
// it too, and useShipments' optimistic update reaches it.
export function useShipment(id: string, list: { shipments: ShipmentItem[]; isLoading: boolean }) {
  const listed = list.shipments.find((shipment) => shipment.id === id);
  // Anything else cannot name a shipment, and the server would answer it with an error of its own.
  const isId = isUuid(id);
  const query = useQuery({
    queryKey: ["shipments", "one", id],
    queryFn: () => api.shipments.shipmentGet(id),
    enabled: isId && !list.isLoading && !listed,
    // "Not found" is an answer, not a failure worth asking about again.
    retry: (failures, err) => !isNotFound(err) && failures < 1,
  });

  // Only the server's word that there is no such shipment makes it "not found": a request that
  // failed for another reason says nothing about the shipment.
  const notFound = !isId || (!listed && isNotFound(query.error));
  const shipment = notFound ? undefined : (listed ?? query.data?.shipment);

  return {
    shipment,
    isLoading: !notFound && !shipment && (list.isLoading || query.isPending),
    notFound,
    /** Why the shipment could not be read, when that is not because it does not exist. */
    error: !shipment && !notFound && query.isError ? apiErrorMessage(query.error) : null,
    reload: query.refetch,
  };
}
