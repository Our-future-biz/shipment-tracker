"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";

type ShipmentItem = interfaces.ShipmentItem;

export const useShipments = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["shipments"],
    queryFn: () => api.shipments.shipmentList({ limit: 200 }),
  });

  const createMutation = useMutation({
    mutationFn: (params: controllers.ShipmentCreateRequest) => api.shipments.shipmentCreate(params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipments"] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: controllers.ShipmentUpdateRequest }) => api.shipments.shipmentUpdate(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipments"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.shipments.shipmentDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipments"] }),
  });

  const shipments = query.data?.data ?? [];

  return {
    shipments,
    isLoading: query.isLoading,
    createShipment: createMutation.mutateAsync,
    updateShipment: updateMutation.mutateAsync,
    deleteShipment: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
};

export const useShipmentFilter = (shipments: ShipmentItem[]) => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    return shipments.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          s.jobNumber.toLowerCase().includes(q) ||
          s.shipper.toLowerCase().includes(q) ||
          s.consignee.toLowerCase().includes(q) ||
          s.pol.toLowerCase().includes(q) ||
          s.pod.toLowerCase().includes(q) ||
          s.vessel.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [shipments, search, statusFilter]);

  return { filtered, search, setSearch, statusFilter, setStatusFilter };
};
