"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";

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
  return { masterJobs: query.data?.data ?? [], isLoading: query.isLoading };
}

// Master-job writes also change the linked shipments (synced fields, containers,
// the "Master job" column), so both caches are refreshed after every write.
export function useMasterJob(id: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: detailKey(id ?? ""),
    queryFn: () => api.shipments.masterJobGet(id as string),
    enabled: !!id,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: LIST_KEY });
    qc.invalidateQueries({ queryKey: ["shipments"] });
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
    masterJob: query.data?.masterJob ?? null,
    containers: query.data?.containers ?? [],
    shipments: query.data?.shipments ?? [],
    isLoading: query.isLoading,
    update,
    setContainers,
    linkShipments,
    unlinkShipment,
  };
}

export function useCreateMasterJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.shipments.masterJobCreate(),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  });
}
