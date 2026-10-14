"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { APIError, ErrCode, type controllers, type services } from "@/lib/api/client";

export type SectionKeyChange = services.SectionKeyChange;

// A field someone else saved since this page read it. The section is reloaded; the caller keeps
// the user's own edit, shows the other version next to it and saves again only once the user
// has chosen which to keep.
export class SectionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SectionConflictError";
  }
}

export const SECTION_CONFLICT_TEXT = "Someone else saved this meanwhile — their version is shown, choose which to keep";

export function useWarehouseSection(shipmentId: string, section: string) {
  const queryClient = useQueryClient();
  const key = ["warehouse-section", shipmentId, section];

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.warehouse.warehouseSectionGet(shipmentId, section),
    enabled: !!shipmentId,
  });

  // Whole-section save: Pick-up only (the server keeps its PIN fields).
  const mutation = useMutation({
    mutationFn: (data: unknown) => api.warehouse.warehouseSectionUpsert(shipmentId, section, { data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  // Field-by-field save (Shipment Details): only the listed keys are written, each only if it
  // still holds the value this page last saw (`expected`), so screens never overwrite each other.
  const patch = useMutation({
    mutationFn: async (changes: SectionKeyChange[]) => {
      try {
        return await api.warehouse.warehouseSectionPatch(shipmentId, section, { changes });
      } catch (e) {
        if (e instanceof APIError && e.code === ErrCode.Aborted) {
          await queryClient.invalidateQueries({ queryKey: key });
          throw new SectionConflictError(e.message);
        }
        throw e;
      }
    },
    onSuccess: (res) => queryClient.setQueryData<controllers.WarehouseSectionGetResponse>(key, { section: res.section }),
  });

  const item = query.data?.section ?? null;
  return {
    data: (item?.data as unknown) ?? null,
    version: item?.version ?? 0,
    isLoading: query.isLoading,
    save: mutation.mutateAsync,
    saveKeys: patch.mutateAsync,
    isSaving: mutation.isPending || patch.isPending,
  };
}

// Pick-up PIN: made by the server (six digits). A new one only once the old one is locked at
// the gate. The answer is the saved section; the Gate Log refreshes so its PIN state follows.
export function useGeneratePickupPin(shipmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.warehouse.pickupPinGenerate(shipmentId),
    onSuccess: (res) => {
      queryClient.setQueryData(["warehouse-section", shipmentId, "pickup"], res);
      queryClient.invalidateQueries({ queryKey: ["warehouse-gate"] });
    },
  });
}
