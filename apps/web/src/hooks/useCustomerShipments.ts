"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";

export type ShipmentItem = interfaces.ShipmentItem;

// The CRM "Shipments" tab reuses the shipments service, filtered by customerId.
export const useCustomerShipments = (customerId: string) => {
  const queryClient = useQueryClient();
  const key = ["customer-shipments", customerId];

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.shipments.shipmentList({ customerId, limit: 200 }),
    enabled: !!customerId,
  });

  // Shipment writes also recompute the customer's stored rollups server-side,
  // so the customer queries must refresh together with the shipment list.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
    queryClient.invalidateQueries({ queryKey: ["customers"] });
  };

  const createMutation = useMutation({
    mutationFn: (params: controllers.ShipmentCreateRequest) => api.shipments.shipmentCreate(params),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, params }: { id: string; params: controllers.ShipmentUpdateRequest }) =>
      api.shipments.shipmentUpdate(id, params),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.shipments.shipmentDelete(id),
    onSuccess: invalidate,
  });

  return {
    shipments: query.data?.data ?? [],
    isLoading: query.isLoading,
    createShipment: createMutation.mutateAsync,
    updateShipment: updateMutation.mutateAsync,
    deleteShipment: deleteMutation.mutateAsync,
  };
};
