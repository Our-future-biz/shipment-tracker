"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage, isNotFound } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { isUuid } from "@/lib/uuid";

export type MasterJobItem = interfaces.MasterJobItem;
export type MasterJobContainerLine = interfaces.MasterJobContainerLine;
export type MasterJobShipmentItem = interfaces.MasterJobShipmentItem;
export type MasterJobUpdate = controllers.MasterJobUpdateRequest;

const LIST_KEY = ["master-jobs"] as const;
const detailKey = (id: string) => ["master-jobs", "one", id] as const;

/** Every master job of the company, newest first. */
export function useMasterJobs() {
  const query = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => api.shipments.masterJobList(),
  });
  return { masterJobs: query.data?.data ?? [], isLoading: query.isLoading, isError: query.isError };
}

/**
 * The shipments linked to a master job, read only while `enabled`. Kept under ["shipments"], so
 * every write that refreshes the shipments (linking, unlinking, deleting, a master-job write)
 * refreshes this too.
 */
export function useMasterJobShipments(id: string, enabled: boolean) {
  const query = useQuery({
    queryKey: ["shipments", "master-job", id],
    queryFn: () => api.shipments.masterJobGet(id),
    enabled,
  });
  return { shipments: query.data?.shipments ?? [], isLoading: query.isLoading, isError: query.isError };
}

// Master-job writes also change the linked shipments (synced fields, containers,
// the "Master job" column), so both caches are refreshed after every write.
export function useMasterJob(id: string | null) {
  const qc = useQueryClient();
  // Anything else cannot name a master job, and the server would answer it with an error of its own.
  const isId = !!id && isUuid(id);
  const query = useQuery({
    queryKey: detailKey(id ?? ""),
    queryFn: () => api.shipments.masterJobGet(id as string),
    enabled: isId,
    // "Not found" is an answer, not a failure worth asking about again.
    retry: (failures, err) => !isNotFound(err) && failures < 1,
  });
  // Only the server's word that there is no such master job makes it "not found" (as useShipment):
  // a request that failed for another reason says nothing about the master job.
  const notFound = !!id && (!isId || isNotFound(query.error));
  const masterJob = notFound ? null : (query.data?.masterJob ?? null);
  const failed = !masterJob && !notFound && query.isError;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: LIST_KEY });
    qc.invalidateQueries({ queryKey: ["shipments"] });
    // Where the houses stand (Linked shipments → Status): linking, unlinking and dates change it.
    qc.invalidateQueries({ queryKey: ["master-job-tracking"] });
  };

  const update = useMutation({
    mutationFn: (data: MasterJobUpdate) => api.shipments.masterJobUpdate(id as string, data),
    onSuccess: refresh,
  });
  const setContainers = useMutation({
    mutationFn: (containers: MasterJobContainerLine[]) =>
      api.shipments.masterJobContainersUpdate(id as string, { containers }),
    onSuccess: refresh,
  });
  const linkShipments = useMutation({
    mutationFn: (shipmentIds: string[]) => api.shipments.masterJobShipmentsLink(id as string, { shipmentIds }),
    onSuccess: refresh,
  });
  const unlinkShipment = useMutation({
    mutationFn: (shipmentId: string) => api.shipments.masterJobShipmentUnlink(id as string, shipmentId),
    onSuccess: refresh,
  });

  return {
    masterJob,
    containers: query.data?.containers ?? [],
    shipments: query.data?.shipments ?? [],
    isLoading: isId && !masterJob && !notFound && query.isPending,
    notFound,
    isError: failed,
    /** Why the master job could not be read, when that is not because it does not exist. */
    error: failed ? apiErrorMessage(query.error) : null,
    reload: query.refetch,
    update,
    setContainers,
    linkShipments,
    unlinkShipment,
  };
}

/** Saves onto any master job (e.g. one just created); refreshes master jobs and shipments. */
export function useUpdateMasterJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: MasterJobUpdate }) => api.shipments.masterJobUpdate(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: ["shipments"] });
      qc.invalidateQueries({ queryKey: ["master-job-tracking"] });
    },
  });
}

export function useCreateMasterJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.shipments.masterJobCreate(),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}
