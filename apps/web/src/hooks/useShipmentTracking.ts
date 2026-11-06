"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";

export type ShipmentTracking = interfaces.ShipmentTracking;
export type TrackingMilestone = interfaces.TrackingMilestone;
export type TrackingChange = interfaces.TrackingChange;
export type TrackingAttention = interfaces.TrackingAttention;
export type TrackingTick = interfaces.TrackingTick;
export type TrackingTaxDate = interfaces.TrackingTaxDate;
export type TrackingRecorded = interfaces.TrackingRecorded;

/** The shipment's dated facts. Other modules and other people write them too, so each opening reads them anew. */
export function useShipmentTracking(shipmentId: string) {
  return useQuery({
    queryKey: ["shipment-tracking", shipmentId],
    queryFn: () => api.shipments.shipmentTracking(shipmentId),
    enabled: !!shipmentId,
    staleTime: 0,
  });
}
