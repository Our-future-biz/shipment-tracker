"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";

export type GateMovement = interfaces.GateMovementItem;
export type GateStampKind = "gateIn" | "gateOut" | "impRelease" | "expDraft" | "expReceipt";

const KEY = ["warehouse-gate"];

export const useGateLog = () => {
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => api.warehouse.gateMovementList(),
  });
  return { movements: query.data?.movements ?? [], isLoading: query.isLoading };
};

// Mutations write the returned row into the cache so the list and the detail stay in step.
export const useGateMovement = (id: string | undefined) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...KEY, id],
    queryFn: () => api.warehouse.gateMovementGet(id!),
    enabled: !!id,
  });

  const onRow = (res: controllers.GateMovementResponse) => {
    queryClient.setQueryData([...KEY, res.movement.id], res);
    queryClient.invalidateQueries({ queryKey: KEY, exact: true });
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
  const verifyPin = useMutation({
    mutationFn: (pin: string) => api.warehouse.gateMovementVerifyPin(id!, { pin }),
    // Failed attempts count towards the lock, so refresh the row either way.
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
  const saveSurvey = useMutation({
    mutationFn: (survey: interfaces.GateSurveyInput) => api.warehouse.gateMovementSaveSurvey(id!, { survey }),
    onSuccess: onRow,
  });
  const remove = useMutation({
    mutationFn: () => api.warehouse.gateMovementDelete(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  return { movement: query.data?.movement, isLoading: query.isLoading, update, stamp, requestRelease, requestMrn, refuse, override, verifyPin, saveSurvey, remove };
};

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
