"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { gateKeys } from "./warehouseKeys";
import { truckingKeys } from "./truckingKeys";

// "Not sent — Send again" (managers): updates to other services that failed for good, and the
// action that sends them again. Trucking: a consignment's job updates, or those of the
// consignments on a trip. Warehouse: a gate record's shipment updates and events for Trucking.

/** A consignment's (or a trip's) failed job updates; only fetched for managers. */
export function useTruckingUnsent(about: { consignmentId?: string; tripId?: string }, manager: boolean) {
  const queryClient = useQueryClient();
  const key = [...truckingKeys.all, "unsent", about.consignmentId ?? "", about.tripId ?? ""] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: () => api.trucking.truckingOutboxFailed(about),
    enabled: manager && !!(about.consignmentId || about.tripId),
  });
  const sendAgain = useMutation({
    mutationFn: () => (about.tripId ? api.trucking.truckingTripSendAgain(about.tripId) : api.trucking.truckingConsignmentSendAgain(about.consignmentId ?? "")),
    onSuccess: (res) => {
      queryClient.setQueryData(key, { updates: res.unsent });
      void queryClient.invalidateQueries({ queryKey: truckingKeys.consignments() });
      void queryClient.invalidateQueries({ queryKey: truckingKeys.trips() });
    },
  });
  return { updates: query.data?.updates ?? [], sendAgain };
}

/** A gate record's failed shipment updates and gate events; only fetched for managers. */
export function useGateUnsent(movementId: string, manager: boolean) {
  const queryClient = useQueryClient();
  const key = [...gateKeys.one(movementId), "unsent"] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: () => api.warehouse.gateMovementUnsent(movementId),
    enabled: manager,
  });
  const sendAgain = useMutation({
    mutationFn: () => api.warehouse.gateMovementSendAgain(movementId),
    onSuccess: (res) => {
      queryClient.setQueryData(gateKeys.one(movementId), { movement: res.movement });
      queryClient.setQueryData(key, { unsent: res.unsent });
    },
  });
  return { unsent: query.data?.unsent ?? null, sendAgain };
}
