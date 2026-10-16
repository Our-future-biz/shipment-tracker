"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { gateKeys, invalidateAfterGateEvent, warehouseRecordKeys, sectionKeys } from "./warehouseKeys";

export { gateKeys, invalidateAfterGateEvent } from "./warehouseKeys";

export type GateMovement = interfaces.GateMovementItem;
export type GateStampKind = "gateIn" | "gateOut" | "impRelease" | "expDraft" | "expReceipt";


// The Gate Log; `archived` lists the archived records instead (managers restore them there).
export const useGateLog = ({ archived = false }: { archived?: boolean } = {}) => {
  const query = useQuery({
    queryKey: archived ? gateKeys.archived() : gateKeys.list(),
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
      queryClient.setQueryData(gateKeys.one(movement.id), { movement });
      queryClient.setQueryData<{ movements: GateMovement[] }>(gateKeys.list(), (old) =>
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
    queryKey: gateKeys.one(id),
    queryFn: () => api.warehouse.gateMovementGet(id!),
    enabled: !!id,
  });

  const onRow = (res: controllers.GateMovementResponse) => {
    queryClient.setQueryData(gateKeys.one(res.movement.id), { movement: res.movement });
    queryClient.invalidateQueries({ queryKey: gateKeys.list(), exact: true });
    queryClient.invalidateQueries({ queryKey: gateKeys.archived(), exact: true });
  };
  // A gate event (stamp, void, archive, restore) also changes what the server builds from gate
  // events: stock, the bonded register, KPIs, sections and the shipment's warehouse part.
  const onGateEvent = (res: controllers.GateMovementResponse) => {
    onRow(res);
    void invalidateAfterGateEvent(queryClient);
  };

  const update = useMutation({
    mutationFn: (data: controllers.GateMovementUpdateRequest) => api.warehouse.gateMovementUpdate(id!, data),
    onSuccess: onRow,
  });
  const stamp = useMutation({
    mutationFn: (kind: GateStampKind) => api.warehouse.gateMovementStamp(id!, { kind }),
    onSuccess: onGateEvent,
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
      queryClient.invalidateQueries({ queryKey: gateKeys.all });
      queryClient.invalidateQueries({ queryKey: sectionKeys.all });
    },
  });
  const saveSurvey = useMutation({
    mutationFn: (survey: interfaces.GateSurveyInput) => api.warehouse.gateMovementSaveSurvey(id!, { survey }),
    onSuccess: onRow,
  });
  const remove = useMutation({
    mutationFn: () => api.warehouse.gateMovementDelete(id!),
    onSuccess: () => void invalidateAfterGateEvent(queryClient),
  });
  // Manager only: archive / restore with a reason, void a wrong stamp (the shipment is not changed back).
  const archive = useMutation({
    mutationFn: (reason: string) => api.warehouse.gateMovementArchive(id!, { reason }),
    onSuccess: onGateEvent,
  });
  const restore = useMutation({
    mutationFn: (reason: string) => api.warehouse.gateMovementRestore(id!, { reason }),
    onSuccess: onGateEvent,
  });
  const voidStamp = useMutation({
    mutationFn: ({ kind, reason }: { kind: GateStampKind; reason: string }) => api.warehouse.gateMovementVoidStamp(id!, { kind, reason }),
    onSuccess: onGateEvent,
  });
  // Customs status read from the shipment now (instead of after the 30 s cache): the follow
  // writes it on the server, then the row is read back.
  const refreshCustoms = useMutation({
    mutationFn: async () => {
      await api.warehouse.gateMovementFollow({ id: id!, force: true });
      return api.warehouse.gateMovementGet(id!);
    },
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
  // LCL cargo is re-weighed before its receipt / tally tick; a correction is a new weighing (the latest counts).
  const reweigh = useMutation({
    mutationFn: (input: interfaces.GateReweighInput) => api.warehouse.gateMovementReweigh(id!, { reweigh: input }),
    onSuccess: (res) => {
      onRow(res);
      // A container's house list shows the re-weighed weight.
      queryClient.invalidateQueries({ queryKey: warehouseRecordKeys.of("containers") });
    },
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
    reweigh,
  };
};

export type GateException = interfaces.GateExceptionItem;

export type GateFile = interfaces.GateFileItem;

// Photos and documents of a movement. Uploads send base64; content comes back the same way.
export const useGateFiles = (movementId: string) => {
  const queryClient = useQueryClient();
  const key = gateKeys.files(movementId);

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

// One stored file's bytes, cached as a Blob; the object URL is made by the component that shows
// it and revoked when that component stops showing it (a URL kept in the cache would leak).
const useGateFileBlob = (movementId: string, file: GateFile | undefined, enabled: boolean) =>
  useQuery({
    queryKey: gateKeys.fileBlob(movementId, file?.id),
    queryFn: async () => {
      const res = await api.warehouse.gateFileContent(movementId, file!.id);
      const bytes = Uint8Array.from(atob(res.contentBase64), (c) => c.charCodeAt(0));
      return new Blob([bytes], { type: res.fileType || "application/octet-stream" });
    },
    enabled: enabled && !!file,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
  });

/** An object URL for one stored file while the calling component shows it. */
export const useGateFileUrl = (movementId: string, file: GateFile | undefined, enabled: boolean): { data: string | undefined } => {
  const { data: blob } = useGateFileBlob(movementId, file, enabled);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return;
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
      setUrl(undefined);
    };
  }, [blob]);
  return { data: url };
};

/** The Gate Log list as query options, for code that reads it outside a component (scanners). */
export const gateListQuery = {
  queryKey: gateKeys.list(),
  queryFn: () => api.warehouse.gateMovementList({}),
};

/** An unannounced truck recorded at the gate (walk-in). */
export const useCreateWalkIn = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (note: string) => api.warehouse.gateMovementCreate({ walkIn: true, note }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: gateKeys.all }),
  });
};

/**
 * Stamps one movement by id (bulk stamping in the grid, the floor's server-only WH release). The
 * row is written to the cache; call `refresh()` once after a batch so the lists built from gate
 * events (stock, bonded, KPIs, sections) are read again.
 */
export const useStampMovement = () => {
  const queryClient = useQueryClient();
  const writeRow = useGateRowCache();
  const stamp = useCallback(
    async (movementId: string, request: controllers.GateStampRequest) => {
      const res = await api.warehouse.gateMovementStamp(movementId, request);
      writeRow(res.movement);
      return res;
    },
    [writeRow],
  );
  const refresh = useCallback(() => invalidateAfterGateEvent(queryClient), [queryClient]);
  return { stamp, refresh };
};

/** Logs printed labels on each movement (copies per movement); `refresh()` once after a batch. */
export const useLogLabelPrints = () => {
  const queryClient = useQueryClient();
  const logPrint = useCallback((movementId: string, copies: number) => api.warehouse.gateMovementLabelPrinted(movementId, { copies }), []);
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: gateKeys.all }), [queryClient]);
  return { logPrint, refresh };
};

/** An exception (damage / short / over) on a movement given by id, e.g. found at a stripping tally. */
export const useCreateGateException = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ movementId, exception }: { movementId: string; exception: interfaces.GateExceptionInput }) =>
      api.warehouse.gateExceptionCreate(movementId, { exception }),
    onSuccess: () => invalidateAfterGateEvent(queryClient),
  });
};

/** Manager: gate records for positions of shipments that have none, read from their shipments. */
export const useRepairMissingGate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.warehouse.gateMovementRepairMissing(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: gateKeys.all }),
  });
};
