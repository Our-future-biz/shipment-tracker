"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { warehouseShipmentKey } from "./warehouseKeys";

/** The shipment a warehouse position belongs to (read-only, for the Remeasurement tab). */
export const useWarehouseShipment = (shipmentId: string | null | undefined) =>
  useQuery({
    queryKey: warehouseShipmentKey(shipmentId),
    queryFn: () => api.shipments.shipmentGet(shipmentId!),
    enabled: !!shipmentId,
  });
