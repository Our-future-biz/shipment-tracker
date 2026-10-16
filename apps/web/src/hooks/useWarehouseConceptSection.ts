"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { APIError, ErrCode, type controllers, type services } from "@/lib/api/client";
import { gateKeys, sectionKeys } from "./warehouseKeys";

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
  const key = sectionKeys.ofShipment(shipmentId, section);

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.warehouseConcept.warehouseSectionGet(shipmentId, section),
    enabled: !!shipmentId,
  });

  // Whole-section save: Pick-up only (the server keeps its PIN fields).
  const mutation = useMutation({
    mutationFn: (data: unknown) => api.warehouseConcept.warehouseSectionUpsert(shipmentId, section, { data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  // Field-by-field save (Shipment Details): only the listed keys are written, each only if it
  // still holds the value this page last saw (`expected`), so screens never overwrite each other.
  const patch = useMutation({
    mutationFn: async (changes: SectionKeyChange[]) => {
      try {
        return await api.warehouseConcept.warehouseSectionPatch(shipmentId, section, { changes });
      } catch (e) {
        if (e instanceof APIError && e.code === ErrCode.Aborted) {
          await queryClient.invalidateQueries({ queryKey: key });
          throw new SectionConflictError(e.message);
        }
        throw e;
      }
    },
    onSuccess: (res) => queryClient.setQueryData<controllers.WarehouseConceptSectionGetResponse>(key, { section: res.section }),
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
    mutationFn: () => api.warehouseConcept.pickupPinGenerate(shipmentId),
    onSuccess: (res) => {
      queryClient.setQueryData(sectionKeys.ofShipment(shipmentId, "pickup"), res);
      queryClient.invalidateQueries({ queryKey: gateKeys.all });
    },
  });
}

export type SentWhat = "vgm" | "survey" | "remeasurement" | "inform_operations";

// A section of a warehouse POSITION (linked to a shipment or stand-alone) — the warehouse's own
// way in. Same field-by-field save and conflict rules as by shipment; a save refreshes every
// cached section (the Shipments view of the same rows included) and the gate records (History).
export function usePositionSection(taskId: string | null | undefined, section: string) {
  const queryClient = useQueryClient();
  const key = sectionKeys.ofTask(taskId ?? "", section);

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.warehouseConcept.warehousePositionSectionGet(taskId!, section),
    enabled: !!taskId,
  });

  const refreshOthers = () => {
    queryClient.invalidateQueries({ queryKey: sectionKeys.all, predicate: (q) => q.queryKey[1] !== "task" || q.queryKey[2] !== taskId });
    queryClient.invalidateQueries({ queryKey: sectionKeys.summary() });
    queryClient.invalidateQueries({ queryKey: gateKeys.all });
  };

  const patch = useMutation({
    mutationFn: async (changes: SectionKeyChange[]) => {
      try {
        return await api.warehouseConcept.warehousePositionSectionPatch(taskId!, section, { changes });
      } catch (e) {
        if (e instanceof APIError && e.code === ErrCode.Aborted) {
          await queryClient.invalidateQueries({ queryKey: key });
          throw new SectionConflictError(e.message);
        }
        throw e;
      }
    },
    onSuccess: (res) => {
      queryClient.setQueryData<controllers.WarehouseConceptSectionGetResponse>(key, { section: res.section });
      refreshOthers();
    },
  });

  // "Mark as sent" / "Inform Operations": a resend is allowed and kept in the history.
  const markSent = useMutation({
    mutationFn: ({ what, note }: { what: SentWhat; note?: string }) => api.warehouseConcept.warehousePositionMarkSent(taskId!, { what, note }),
    onSuccess: (res) => {
      queryClient.setQueryData<controllers.WarehouseConceptSectionGetResponse>(key, { section: res.section });
      refreshOthers();
    },
  });

  const item = query.data?.section ?? null;
  const data = item?.data && typeof item.data === "object" && !Array.isArray(item.data) ? (item.data as Record<string, unknown>) : {};
  return {
    data,
    version: item?.version ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    saveKeys: patch.mutateAsync,
    markSent: markSent.mutateAsync,
    isSaving: patch.isPending,
    isMarking: markSent.isPending,
  };
}

// Per position: remeasured lines saved, last remeasurement sent, operations informed (worklist).
export function useWarehouseSectionSummary(enabled = true) {
  const query = useQuery({
    queryKey: sectionKeys.summary(),
    queryFn: () => api.warehouseConcept.warehouseSectionSummary(),
    enabled,
  });
  return { positions: query.data?.positions ?? [], isLoading: query.isLoading };
}
