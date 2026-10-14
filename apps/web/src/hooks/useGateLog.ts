"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";

export type GateMovement = interfaces.GateMovementItem;
export type GateStampKind = "gateIn" | "gateOut" | "impRelease" | "expDraft" | "expReceipt";

const KEY = ["warehouse-gate"];
const ARCHIVED_KEY = [...KEY, "archived"];

// The Gate Log; `archived` lists the archived records instead (managers restore them there).
export const useGateLog = ({ archived = false }: { archived?: boolean } = {}) => {
  const query = useQuery({
    queryKey: archived ? ARCHIVED_KEY : KEY,
    queryFn: () => api.warehouse.gateMovementList(archived ? { archived: true } : {}),
  });
  return { movements: query.data?.movements ?? [], isLoading: query.isLoading };
};

/**
 * Writes a movement the server returned into the cache — its detail and its row in the Gate Log
 * list — without reading the list again (floor mode works from the cached list, also offline).
 */
export const useGateRowCache = () => {
  const queryClient = useQueryClient();
  return useCallback(
    (movement: GateMovement) => {
      queryClient.setQueryData([...KEY, movement.id], { movement });
      queryClient.setQueryData<{ movements: GateMovement[] }>(KEY, (old) =>
        old ? { ...old, movements: old.movements.map((m) => (m.id === movement.id ? movement : m)) } : old,
      );
    },
    [queryClient],
  );
};

// Mutations write the returned row into the cache so the list and the detail stay in step.
export const useGateMovement = (id: string | undefined) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...KEY, id],
    queryFn: () => api.warehouse.gateMovementGet(id!, {}),
    enabled: !!id,
  });

  const onRow = (res: controllers.GateMovementResponse) => {
    queryClient.setQueryData([...KEY, res.movement.id], { movement: res.movement });
    queryClient.invalidateQueries({ queryKey: KEY, exact: true });
    queryClient.invalidateQueries({ queryKey: ARCHIVED_KEY, exact: true });
  };

  const update = useMutation({
    mutationFn: (data: Omit<controllers.GateMovementUpdateRequest, "id">) => api.warehouse.gateMovementUpdate(id!, data as controllers.GateMovementUpdateRequest),
    onSuccess: onRow,
  });
  const stamp = useMutation({
    mutationFn: (kind: GateStampKind) => api.warehouse.gateMovementStamp(id!, { kind }),
    onSuccess: onRow,
  });
  const requestRelease = useMutation({
    mutationFn: () => api.warehouse.gateMovementRequestRelease(id!),
    onSuccess: onRow,
  });
  const requestMrn = useMutation({
    mutationFn: () => api.warehouse.gateMovementRequestMrn(id!),
    onSuccess: onRow,
  });
  const refuse = useMutation({
    mutationFn: (reason: string) => api.warehouse.gateMovementRefuse(id!, { reason }),
    onSuccess: onRow,
  });
  const override = useMutation({
    mutationFn: (reason: string) => api.warehouse.gateMovementOverride(id!, { reason }),
    onSuccess: onRow,
  });
  const setReleaseGate = useMutation({
    mutationFn: ({ gate, ok }: { gate: string; ok: boolean }) => api.warehouse.gateMovementReleaseGate(id!, { gate, ok }),
    onSuccess: onRow,
  });
  const verifyPin = useMutation({
    mutationFn: (pin: string) => api.warehouse.gateMovementVerifyPin(id!, { pin }),
    // Failed attempts count towards the lock, so refresh the row either way — and the pick-up
    // section, whose tries a linked outbound movement uses.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ["warehouse-section"] });
    },
  });
  const saveSurvey = useMutation({
    mutationFn: (survey: interfaces.GateSurveyInput) => api.warehouse.gateMovementSaveSurvey(id!, { survey }),
    onSuccess: onRow,
  });
  const remove = useMutation({
    mutationFn: () => api.warehouse.gateMovementDelete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ["warehouse"] });
    },
  });
  // Manager only: archive / restore with a reason, void a wrong stamp (the shipment is not changed back).
  const archive = useMutation({
    mutationFn: (reason: string) => api.warehouse.gateMovementArchive(id!, { reason }),
    onSuccess: onRow,
  });
  const restore = useMutation({
    mutationFn: (reason: string) => api.warehouse.gateMovementRestore(id!, { reason }),
    onSuccess: (res) => {
      onRow(res);
      queryClient.invalidateQueries({ queryKey: ["warehouse"] });
    },
  });
  const voidStamp = useMutation({
    mutationFn: ({ kind, reason }: { kind: GateStampKind; reason: string }) => api.warehouse.gateMovementVoidStamp(id!, { kind, reason }),
    onSuccess: onRow,
  });
  // Customs status read from the shipment now (instead of after the 30 s cache).
  const refreshCustoms = useMutation({
    mutationFn: () => api.warehouse.gateMovementGet(id!, { refresh: true }),
    onSuccess: onRow,
  });
  const refreshFromShipment = useMutation({
    mutationFn: () => api.warehouse.gateMovementRefreshFromShipment(id!),
    onSuccess: onRow,
  });
  const retryShipmentUpdate = useMutation({
    mutationFn: () => api.warehouse.gateMovementShipmentUpdateRetry(id!),
    onSuccess: onRow,
  });
  const dismissShipmentUpdate = useMutation({
    mutationFn: () => api.warehouse.gateMovementShipmentUpdateDismiss(id!),
    onSuccess: onRow,
  });
  // Gate figures (pieces, kg, cbm) from the position's saved remeasured lines — never the shipment.
  const applyRemeasured = useMutation({
    mutationFn: (sectionVersion: number) => api.warehouse.gateMovementUseRemeasured(id!, { sectionVersion }),
    onSuccess: onRow,
  });
  // Damage / short / over: an open exception holds the release until resolved with a note.
  const createException = useMutation({
    mutationFn: (exception: interfaces.GateExceptionInput) => api.warehouse.gateExceptionCreate(id!, { exception }),
    onSuccess: onRow,
  });
  const resolveException = useMutation({
    mutationFn: ({ exceptionId, note }: { exceptionId: string; note: string }) => api.warehouse.gateExceptionResolve(id!, exceptionId, { note }),
    onSuccess: onRow,
  });

  return {
    movement: query.data?.movement,
    isLoading: query.isLoading,
    update,
    stamp,
    requestRelease,
    requestMrn,
    refuse,
    override,
    setReleaseGate,
    verifyPin,
    saveSurvey,
    remove,
    archive,
    restore,
    voidStamp,
    refreshCustoms,
    refreshFromShipment,
    retryShipmentUpdate,
    dismissShipmentUpdate,
    applyRemeasured,
    createException,
    resolveException,
  };
};

export type GateException = interfaces.GateExceptionItem;

export type GateFile = interfaces.GateFileItem;

// Photos and documents of a movement. Uploads send base64; content comes back the same way.
export const useGateFiles = (movementId: string) => {
  const queryClient = useQueryClient();
  const key = [...KEY, movementId, "files"];

  const query = useQuery({ queryKey: key, queryFn: () => api.warehouse.gateFileList(movementId) });

  const upload = useMutation({
    mutationFn: (input: { fileName: string; fileType: string; contentBase64: string; container?: string; tag?: string }) =>
      api.warehouse.gateFileUpload(movementId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({
    mutationFn: (fileId: string) => api.warehouse.gateFileDelete(movementId, fileId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { files: query.data?.files ?? [], isLoading: query.isLoading, upload, remove };
};

// Object URL for one stored file, created from its bytes and revoked when no longer cached.
export const useGateFileUrl = (movementId: string, file: GateFile | undefined, enabled: boolean) =>
  useQuery({
    queryKey: [...KEY, movementId, "files", file?.id, "url"],
    queryFn: async () => {
      const res = await api.warehouse.gateFileContent(movementId, file!.id);
      const bytes = Uint8Array.from(atob(res.contentBase64), (c) => c.charCodeAt(0));
      return URL.createObjectURL(new Blob([bytes], { type: res.fileType || "application/octet-stream" }));
    },
    enabled: enabled && !!file,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
  });
