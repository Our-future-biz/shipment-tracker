"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";

// Warehouse settings (supplier e-mail recipients per message type, docks and hours). Kept next to
// the settings screen; the integrator may move it to src/hooks/useWarehouseSettings.ts.

export type WarehouseSettings = interfaces.WarehouseSettingsItem;
export type SupplierKind = "vgm" | "survey" | "remeasurement";
export type SupplierRecipients = interfaces.SupplierRecipientsItem;

export const WAREHOUSE_SETTINGS_KEY = ["warehouse-settings"] as const;

export function useWarehouseSettings(enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: WAREHOUSE_SETTINGS_KEY,
    queryFn: () => api.warehouse.warehouseSettingsGet(),
    enabled,
    staleTime: 30_000,
  });

  // A save on top of a newer version is refused (aborted); the settings are reloaded then.
  const update = useMutation({
    mutationFn: (req: { expectedVersion: number; supplierEmail?: Partial<Record<SupplierKind, SupplierRecipients>>; docks?: interfaces.DockSettingsItem }) =>
      api.warehouse.warehouseSettingsUpdate(req),
    onSuccess: (res) => queryClient.setQueryData(WAREHOUSE_SETTINGS_KEY, res),
    onError: () => queryClient.invalidateQueries({ queryKey: WAREHOUSE_SETTINGS_KEY }),
  });

  return {
    settings: query.data?.settings ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    save: update.mutateAsync,
    isSaving: update.isPending,
  };
}

/** The recipients a send of `kind` goes to, or null when it is only recorded (off / no To). */
export function emailedTo(settings: WarehouseSettings | null | undefined, kind: SupplierKind): { to: string[]; cc: string[] } | null {
  const r = settings?.supplierEmail?.[kind];
  return r && r.enabled && r.to.length ? { to: r.to, cc: r.cc } : null;
}
