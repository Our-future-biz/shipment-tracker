"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { useFilePreview } from "./useFilePreview";
import { gateKeys, invalidateAfterGateEvent, warehouseRecordKeys, sectionKeys } from "./warehouseKeys";

export { gateKeys, invalidateAfterGateEvent } from "./warehouseKeys";

export type GateMovement = interfaces.GateMovementItem;
export type GateStampKind = "gateIn" | "gateOut" | "impRelease" | "expDraft" | "expReceipt";


// The Gate Log; `archived` lists the archived records instead (managers restore them there).
export const useGateLog = ({ archived = false }: { archived?: boolean } = {}) => {
  const query = useQuery({
    queryKey: archived ? gateKeys.archived() : gateKeys.list(),
    queryFn: () => api.warehouseConcept.gateMovementList(archived ? { archived: true } : {}),
  });
  // isError: a failed read must not read as "no movements".
  return { movements: query.data?.movements ?? [], isLoading: query.isLoading, isError: query.isError };
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
    queryFn: () => api.warehouseConcept.gateMovementGet(id!),
    enabled: !!id,
  });

  const onRow = (res: controllers.GateMovementResponse) => {
    queryClient.setQueryData(gateKeys.one(res.movement.id), { movement: res.movement });
    queryClient.invalidateQueries({ queryKey: gateKeys.list(), exact: true });
    queryClient.invalidateQueries({ queryKey: gateKeys.archived(), exact: true });
  };
  // A gate event (stamp, void, archive, restore), and a change of the record's figures or customs,
  // also changes what the server builds from gate records: stock, the bonded register, KPIs,
  // sections and the shipment's warehouse part.
  const onGateEvent = (res: controllers.GateMovementResponse) => {
    onRow(res);
    void invalidateAfterGateEvent(queryClient);
  };

  // The server builds the stock line and the bonded entry again from the changed record.
  const update = useMutation({
    mutationFn: (data: controllers.GateMovementUpdateRequest) => api.warehouseConcept.gateMovementUpdate(id!, data),
    onSuccess: onGateEvent,
  });
  const stamp = useMutation({
    mutationFn: (kind: GateStampKind) => api.warehouseConcept.gateMovementStamp(id!, { kind }),
    onSuccess: onGateEvent,
  });
  const requestRelease = useMutation({
    mutationFn: () => api.warehouseConcept.gateMovementRequestRelease(id!),
    onSuccess: onRow,
  });
  const requestMrn = useMutation({
    mutationFn: () => api.warehouseConcept.gateMovementRequestMrn(id!),
    onSuccess: onRow,
  });
  const refuse = useMutation({
    mutationFn: (reason: string) => api.warehouseConcept.gateMovementRefuse(id!, { reason }),
    onSuccess: onRow,
  });
  const override = useMutation({
    mutationFn: (reason: string) => api.warehouseConcept.gateMovementOverride(id!, { reason }),
    onSuccess: onRow,
  });
  const setReleaseGate = useMutation({
    mutationFn: ({ gate, ok }: { gate: string; ok: boolean }) => api.warehouseConcept.gateMovementReleaseGate(id!, { gate, ok }),
    onSuccess: onRow,
  });
  const verifyPin = useMutation({
    mutationFn: (pin: string) => api.warehouseConcept.gateMovementVerifyPin(id!, { pin }),
    // Failed attempts count towards the lock, so refresh the row either way — and the pick-up
    // section, whose tries a linked outbound movement uses.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: gateKeys.all });
      queryClient.invalidateQueries({ queryKey: sectionKeys.all });
    },
  });
  const saveSurvey = useMutation({
    mutationFn: (survey: interfaces.GateSurveyInput) => api.warehouseConcept.gateMovementSaveSurvey(id!, { survey }),
    onSuccess: onRow,
  });
  const remove = useMutation({
    mutationFn: () => api.warehouseConcept.gateMovementDelete(id!),
    onSuccess: () => void invalidateAfterGateEvent(queryClient),
  });
  // Manager only: archive / restore with a reason, void a wrong stamp (the shipment is not changed back).
  const archive = useMutation({
    mutationFn: (reason: string) => api.warehouseConcept.gateMovementArchive(id!, { reason }),
    onSuccess: onGateEvent,
  });
  const restore = useMutation({
    mutationFn: (reason: string) => api.warehouseConcept.gateMovementRestore(id!, { reason }),
    onSuccess: onGateEvent,
  });
  const voidStamp = useMutation({
    mutationFn: ({ kind, reason }: { kind: GateStampKind; reason: string }) => api.warehouseConcept.gateMovementVoidStamp(id!, { kind, reason }),
    onSuccess: onGateEvent,
  });
  // Customs status read from the shipment now (instead of after the 30 s cache): the follow
  // writes it on the server (opening or discharging the bonded entry), then the row is read back.
  const refreshCustoms = useMutation({
    mutationFn: async () => {
      await api.warehouseConcept.gateMovementFollow({ id: id!, force: true });
      return api.warehouseConcept.gateMovementGet(id!);
    },
    onSuccess: onGateEvent,
  });
  // The shipment's figures and customs copied again: the stock line and bonded entry follow.
  const refreshFromShipment = useMutation({
    mutationFn: () => api.warehouseConcept.gateMovementRefreshFromShipment(id!),
    onSuccess: onGateEvent,
  });
  const retryShipmentUpdate = useMutation({
    mutationFn: () => api.warehouseConcept.gateMovementShipmentUpdateRetry(id!),
    onSuccess: onRow,
  });
  const dismissShipmentUpdate = useMutation({
    mutationFn: () => api.warehouseConcept.gateMovementShipmentUpdateDismiss(id!),
    onSuccess: onRow,
  });
  // "Shipment may need correcting" once it was corrected in Shipments by hand.
  const dismissCorrection = useMutation({
    mutationFn: () => api.warehouseConcept.gateMovementCorrectionDismiss(id!),
    onSuccess: onGateEvent,
  });
  // Gate figures (pieces, kg, cbm) from the position's saved remeasured lines — never the shipment.
  // The stock line takes the new figures.
  const applyRemeasured = useMutation({
    mutationFn: (sectionVersion: number) => api.warehouseConcept.gateMovementUseRemeasured(id!, { sectionVersion }),
    onSuccess: onGateEvent,
  });
  // Damage / short / over: an open exception holds the release until resolved with a note.
  const createException = useMutation({
    mutationFn: (exception: interfaces.GateExceptionInput) => api.warehouseConcept.gateExceptionCreate(id!, { exception }),
    onSuccess: onRow,
  });
  // LCL cargo is re-weighed before its receipt / tally tick; a correction is a new weighing (the latest counts).
  const reweigh = useMutation({
    mutationFn: (input: interfaces.GateReweighInput) => api.warehouseConcept.gateMovementReweigh(id!, { reweigh: input }),
    onSuccess: (res) => {
      onRow(res);
      // A container's house list shows the re-weighed weight.
      queryClient.invalidateQueries({ queryKey: warehouseRecordKeys.of("containers") });
    },
  });
  const resolveException = useMutation({
    mutationFn: ({ exceptionId, note }: { exceptionId: string; note: string }) => api.warehouseConcept.gateExceptionResolve(id!, exceptionId, { note }),
    onSuccess: onRow,
  });

  return {
    movement: query.data?.movement,
    isLoading: query.isLoading,
    /** Why the movement could not be read (not found, or the server failed). */
    error: query.error,
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
    dismissCorrection,
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

  const query = useQuery({ queryKey: key, queryFn: () => api.warehouseConcept.gateFileList(movementId) });

  const upload = useMutation({
    mutationFn: (input: { fileName: string; fileType: string; contentBase64: string; container?: string; tag?: string }) =>
      api.warehouseConcept.gateFileUpload(movementId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({
    mutationFn: (fileId: string) => api.warehouseConcept.gateFileDelete(movementId, fileId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { files: query.data?.files ?? [], isLoading: query.isLoading, upload, remove };
};

// One stored file's bytes, cached as a Blob (a thumbnail's bytes also serve its preview); the object
// URL is made by the component that shows it and revoked when that component stops showing it (a
// URL kept in the cache would leak).
const gateFileBlobQuery = (movementId: string, fileId: string | undefined) => ({
  queryKey: gateKeys.fileBlob(movementId, fileId),
  queryFn: async () => {
    const res = await api.warehouseConcept.gateFileContent(movementId, fileId!);
    const bytes = Uint8Array.from(atob(res.contentBase64), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: res.fileType || "application/octet-stream" });
  },
  staleTime: Infinity,
  gcTime: 5 * 60 * 1000,
});

const useGateFileBlob = (movementId: string, file: GateFile | undefined, enabled: boolean) =>
  useQuery({ ...gateFileBlobQuery(movementId, file?.id), enabled: enabled && !!file });

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

/**
 * The app's preview (hooks/useFilePreview) of a movement's stored files: `open(file)` shows one, from
 * the bytes its thumbnail already loaded or fetched now; `modal` is rendered once by the caller.
 */
export const useGateFilePreview = () => {
  const queryClient = useQueryClient();
  const { open, modal } = useFilePreview();
  const show = (file: GateFile) =>
    void open({ fileName: file.fileName, fileType: file.fileType, load: () => queryClient.fetchQuery(gateFileBlobQuery(file.movementId, file.id)) });
  return { open: show, modal };
};

/** The Gate Log list as query options, for code that reads it outside a component (scanners). */
export const gateListQuery = {
  queryKey: gateKeys.list(),
  queryFn: () => api.warehouseConcept.gateMovementList({}),
};

/** An unannounced truck recorded at the gate (walk-in). */
export const useCreateWalkIn = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (note: string) => api.warehouseConcept.gateMovementCreate({ walkIn: true, note }),
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
      const res = await api.warehouseConcept.gateMovementStamp(movementId, request);
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
  const logPrint = useCallback((movementId: string, copies: number) => api.warehouseConcept.gateMovementLabelPrinted(movementId, { copies }), []);
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: gateKeys.all }), [queryClient]);
  return { logPrint, refresh };
};

/** An exception (damage / short / over) on a movement given by id, e.g. found at a stripping tally. */
export const useCreateGateException = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ movementId, exception }: { movementId: string; exception: interfaces.GateExceptionInput }) =>
      api.warehouseConcept.gateExceptionCreate(movementId, { exception }),
    onSuccess: () => invalidateAfterGateEvent(queryClient),
  });
};

/** Manager: gate records for positions of shipments that have none, read from their shipments. */
export const useRepairMissingGate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.warehouseConcept.gateMovementRepairMissing(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: gateKeys.all }),
  });
};
