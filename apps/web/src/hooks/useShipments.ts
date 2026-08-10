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
    if (val == null) return "";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
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
      if (val == null) { data[col.key] = ""; }
      else if (typeof val === "object") { data[col.key] = JSON.stringify(val); }
      else { data[col.key] = String(val); }
    }
  }
  return data;
}

export interface ShipmentQueryParams {
  /** Free-text search, executed server-side across job#, shipper, consignee, customer, POL, POD. */
  search?: string;
  /** Coarse status bucket, matched server-side. */
  statusBucket?: string;
}

export const useShipments = (params: ShipmentQueryParams = {}) => {
  const queryClient = useQueryClient();

  const search = params.search?.trim() || undefined;
  const statusBucket = params.statusBucket && params.statusBucket !== "all" ? params.statusBucket : undefined;

  // Search and status are applied server-side (scoped to the company), so they cover the
  // whole dataset rather than only the rows already loaded in the browser.
  const query = useQuery({
    queryKey: ["shipments", search ?? "", statusBucket ?? ""],
    queryFn: () => api.shipments.shipmentList({ limit: 200, search, statusBucket }),
    placeholderData: (prev) => prev,
  });

  const createMutation = useMutation({
    mutationFn: (params: controllers.ShipmentCreateRequest) => api.shipments.shipmentCreate(params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipments"] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: controllers.ShipmentUpdateRequest }) =>
      api.shipments.shipmentUpdate(id, data),
    // Optimistic update for snappy inline editing. The query key now carries the active
    // search/status, so patch every cached shipments page rather than one fixed key.
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["shipments"] });
      const prev = queryClient.getQueriesData<{ data: ShipmentItem[] }>({ queryKey: ["shipments"] });
      queryClient.setQueriesData<{ data: ShipmentItem[] }>({ queryKey: ["shipments"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((s) => {
            if (s.id !== id) return s;
            // Merge update request into shipment using Object.assign for type safety
            const updated: ShipmentItem = { ...s };
            Object.assign(updated, data);
            return updated;
          }),
        };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.prev?.forEach(([key, value]) => queryClient.setQueryData(key, value));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["shipments"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.shipments.shipmentDelete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipments"] }),
  });

  const linkMasterJobMutation = useMutation({
    mutationFn: ({ shipmentId, mczNumber }: { shipmentId: string; mczNumber: string }) =>
      api.shipments.shipmentLinkMasterJob(shipmentId, { mczNumber }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipments"] }),
  });

  const unlinkMasterJobMutation = useMutation({
    mutationFn: (shipmentId: string) => api.shipments.shipmentUnlinkMasterJob(shipmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipments"] }),
  });

  const shipments: ShipmentItem[] = query.data?.data ?? [];

  // Fields that trigger automation when changed
  const AUTOMATION_FIELDS = new Set(["department", "status", "holidayCover"]);

  // Update a single field (handles API field vs extra field routing)
  const updateField = useCallback(
    (shipmentId: string, fieldKey: string, value: string) => {
      const col = COLUMN_MAP.get(fieldKey);
      if (!col) return;

      // Get old value for automation comparison
      const shipment = shipments.find((s) => s.id === shipmentId);
      const oldValue = shipment ? getFieldValue(shipment, fieldKey) : "";

      if (col.apiField) {
        updateMutation.mutate({ id: shipmentId, data: { [col.apiField]: value } as controllers.ShipmentUpdateRequest });
      }

      // Fire automation trigger for watched fields
      if (AUTOMATION_FIELDS.has(fieldKey) && value !== oldValue && shipment) {
        const shipmentData = buildRowData(shipment);
        // Actor (triggeredById) is derived server-side from the token.
        api.automation.automationTrigger({
          shipmentId,
          column: col.title,
          oldValue,
          newValue: value,
          shipmentData,
        }).catch(() => { /* fire and forget */ });
      }
    },
    [updateMutation, shipments],
  );

  return {
    shipments,
    isLoading: query.isLoading,
    createShipment: createMutation.mutateAsync,
    updateShipment: updateMutation.mutateAsync,
    updateField,
    deleteShipment: deleteMutation.mutateAsync,
    linkMasterJob: linkMasterJobMutation.mutateAsync,
    unlinkMasterJob: unlinkMasterJobMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isLinkingMasterJob: linkMasterJobMutation.isPending,
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
