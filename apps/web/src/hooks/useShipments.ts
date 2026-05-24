"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { COLUMNS, COLUMN_MAP, getComputedValue, COMPUTED_COLUMNS } from "@/lib/columnConfig";
import type { interfaces, controllers } from "@/lib/api/client";

export type ShipmentItem = interfaces.ShipmentItem;

// Get the display value for a column from a shipment record
export function getFieldValue(shipment: ShipmentItem, key: string): string {
  // Computed columns
  if (COMPUTED_COLUMNS.has(key)) {
    const rowData = buildRowData(shipment);
    return getComputedValue(key, rowData);
  }

  const col = COLUMN_MAP.get(key);
  if (!col) return "";

  // Direct API field
  if (col.apiField) {
    const val = shipment[col.apiField as keyof ShipmentItem];
    return val != null ? String(val) : "";
  }

  // Extra field
  if (col.isExtra) {
    return shipment.extra?.[key] ?? "";
  }

  return "";
}

// Build a flat key→value map for a shipment (used for computed columns and conditional formatting)
export function buildRowData(shipment: ShipmentItem): Record<string, string> {
  const data: Record<string, string> = {};
  for (const col of COLUMNS) {
    if (col.type === "computed") continue; // avoid recursion
    if (col.apiField) {
      const val = shipment[col.apiField as keyof ShipmentItem];
      data[col.key] = val != null ? String(val) : "";
    } else if (col.isExtra) {
      data[col.key] = shipment.extra?.[col.key] ?? "";
    }
  }
  return data;
}

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
    mutationFn: ({ id, data }: { id: string; data: controllers.ShipmentUpdateRequest }) =>
      api.shipments.shipmentUpdate(id, data),
    // Optimistic update for snappy inline editing
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["shipments"] });
      const prev = queryClient.getQueryData(["shipments"]);
      queryClient.setQueryData(["shipments"], (old: { data: ShipmentItem[] } | undefined) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((s) => {
            if (s.id !== id) return s;
            // Merge update request into shipment using Object.assign for type safety
            const updated: ShipmentItem = { ...s };
            const { extra, ...fields } = data;
            Object.assign(updated, fields);
            if (extra) {
              updated.extra = { ...(updated.extra || {}), ...extra };
            }
            return updated;
          }),
        };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["shipments"], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["shipments"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.shipments.shipmentDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipments"] }),
  });

  const shipments: ShipmentItem[] = query.data?.data ?? [];

  // Update a single field (handles API field vs extra field routing)
  const updateField = useCallback(
    (shipmentId: string, fieldKey: string, value: string) => {
      const col = COLUMN_MAP.get(fieldKey);
      if (!col) return;

      if (col.apiField) {
        updateMutation.mutate({ id: shipmentId, data: { [col.apiField]: value } as controllers.ShipmentUpdateRequest });
      } else if (col.isExtra) {
        updateMutation.mutate({ id: shipmentId, data: { extra: { [fieldKey]: value } } });
      }
    },
    [updateMutation],
  );

  return {
    shipments,
    isLoading: query.isLoading,
    createShipment: createMutation.mutateAsync,
    updateShipment: updateMutation.mutateAsync,
    updateField,
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
        // Search across all visible columns
        for (const col of COLUMNS) {
          const val = getFieldValue(s, col.key);
          if (val && val.toLowerCase().includes(q)) return true;
        }
        return false;
      }
      return true;
    });
  }, [shipments, search, statusFilter]);

  return { filtered, search, setSearch, statusFilter, setStatusFilter };
};
