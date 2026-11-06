"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { APIError, ErrCode, type controllers, type interfaces } from "@/lib/api/client";
import { chatQueryKeys } from "@/lib/informOperations";

export type WarehouseSectionChange = interfaces.WarehouseSectionChange;

/** A field someone else saved since this page read it: the section is reloaded, so their version shows. */
export class SectionChangedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SectionChangedError";
  }
}

export function useWarehouseSection(shipmentId: string, section: string) {
  const queryClient = useQueryClient();
  const key = ["warehouse-section", shipmentId, section];

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.warehouse.warehouseSectionGet(shipmentId, section),
    enabled: !!shipmentId,
  });

  // Whole-section save: Pick-up only. Shipment Details ("job") is saved field by field.
  const mutation = useMutation({
    mutationFn: (data: unknown) =>
      api.warehouse.warehouseSectionUpsert(shipmentId, section, { data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      // Its License Plates are a column of the shipment grids.
      if (section === "pickup") queryClient.invalidateQueries({ queryKey: ["shipments"] });
    },
  });

  // Field-by-field save (Shipment Details): only the listed fields are written, each sent with
  // `expected` only if it still holds what this page last saw - so the notes, the remeasured lines
  // and the "sent" marks never take each other back.
  const patch = useMutation({
    mutationFn: async (changes: WarehouseSectionChange[]) => {
      try {
        return await api.warehouse.warehouseSectionPatch(shipmentId, section, { changes });
      } catch (e) {
        if (e instanceof APIError && e.code === ErrCode.Aborted) {
          await queryClient.invalidateQueries({ queryKey: key });
          throw new SectionChangedError(e.message);
        }
        throw e;
      }
    },
    onSuccess: (res) => queryClient.setQueryData<controllers.WarehouseSectionGetResponse>(key, { section: res.section }),
  });

  // Inform Operations: the server records when and posts the notice to the shipment's chat in one
  // request (both, or neither). `expected`: when Operations were informed as this page shows it.
  const inform = useMutation({
    mutationFn: async (expected: string) => {
      try {
        return await api.warehouse.warehouseInformOperations(shipmentId, { expected });
      } catch (e) {
        if (e instanceof APIError && e.code === ErrCode.Aborted) {
          await queryClient.invalidateQueries({ queryKey: key });
          throw new SectionChangedError("Operations were informed meanwhile — the time is shown again; inform again if needed");
        }
        throw e;
      }
    },
    onSuccess: (res) => {
      queryClient.setQueryData<controllers.WarehouseSectionGetResponse>(key, { section: res.section });
      // The shipment's chat, the bell's mentions and the grid's unread marks show the notice posted.
      for (const queryKey of chatQueryKeys(shipmentId)) queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    data: query.data?.section?.data ?? null,
    isLoading: query.isLoading,
    save: mutation.mutateAsync,
    saveKeys: patch.mutateAsync,
    informOperations: inform.mutateAsync,
    isSaving: mutation.isPending || patch.isPending,
    isInforming: inform.isPending,
  };
}
