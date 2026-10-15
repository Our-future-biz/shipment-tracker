"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { truckingKeys } from "./truckingKeys";
import { useConsignments, useRefreshLists, type ConsignmentDetail } from "./useTruckingConsignments";

// Avizace and delivery exceptions of a consignment (Phase 6). Every shape is taken from the client
// methods, so the screens follow the API when the client is regenerated.

export type AvizaceTemplate = Awaited<ReturnType<typeof api.trucking.truckingAvizaceTemplate>>["template"];
export type AvizaceRecordRequest = Parameters<typeof api.trucking.truckingAvizaceRecord>[1];
export type AvizaceChannel = AvizaceRecordRequest["channel"];
export type AvizaceRecord = NonNullable<ConsignmentDetail["avizace"]>;
export type DeliveryException = Awaited<ReturnType<typeof api.trucking.truckingExceptionCreate>>["exception"];
export type ExceptionCreate = Parameters<typeof api.trucking.truckingExceptionCreate>[1];
export type ExceptionDecide = Parameters<typeof api.trucking.truckingExceptionDecide>[1];
export type ExceptionPhoto = Parameters<typeof api.trucking.truckingExceptionPhoto>[1];
export type ExceptionKind = ExceptionCreate["kind"];
export type FailedReason = NonNullable<ExceptionCreate["failedReason"]>;
export type ExceptionCause = ExceptionCreate["cause"];
export type ExceptionDecision = ExceptionDecide["decision"];
export type ExceptionCurrency = ExceptionCreate["currency"];
export type WarehouseException = ConsignmentDetail["warehouseExceptions"][number];

/** The consignments still waiting for their avizace (id → ref), for the warnings on trip cards. */
export function useAvizacePending(): ReadonlyMap<string, string> {
  const { consignments } = useConsignments({ view: "avizacePending" });
  return useMemo(() => new Map(consignments.map((c) => [c.id, c.ref])), [consignments]);
}

/** The avizace text to copy; read when the drawer opens (it follows the consignment as stored). */
export function useAvizaceTemplate(consignmentId: string, { enabled = true } = {}) {
  const query = useQuery({
    queryKey: truckingKeys.avizaceTemplate(consignmentId),
    queryFn: () => api.trucking.truckingAvizaceTemplate(consignmentId),
    enabled: enabled && !!consignmentId,
    staleTime: 0,
  });
  return { template: query.data?.template ?? null, isLoading: query.isLoading, error: query.error };
}

/** Records the avizace and the exceptions of one consignment; each answer refreshes the consignment and the lists. */
export function useConsignmentControl(consignmentId: string) {
  const queryClient = useQueryClient();
  const refreshLists = useRefreshLists();
  const refreshConsignment = () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: truckingKeys.consignment(consignmentId) }), refreshLists()]);

  const recordAvizace = useMutation({
    mutationFn: (req: AvizaceRecordRequest) => api.trucking.truckingAvizaceRecord(consignmentId, req),
    onSuccess: (res) => {
      queryClient.setQueryData(truckingKeys.consignment(consignmentId), { consignment: res.consignment });
      return refreshLists();
    },
  });
  const createException = useMutation({
    mutationFn: (req: ExceptionCreate) => api.trucking.truckingExceptionCreate(consignmentId, req),
    onSuccess: refreshConsignment,
  });
  const decideException = useMutation({
    mutationFn: ({ id, req }: { id: string; req: ExceptionDecide }) => api.trucking.truckingExceptionDecide(id, req),
    onSuccess: refreshConsignment,
  });
  const closeException = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => api.trucking.truckingExceptionClose(id, { note }),
    onSuccess: refreshConsignment,
  });
  const addPhoto = useMutation({
    mutationFn: ({ id, req }: { id: string; req: ExceptionPhoto }) => api.trucking.truckingExceptionPhoto(id, req),
    onSuccess: refreshConsignment,
  });

  return {
    recordAvizace: recordAvizace.mutateAsync,
    createException: createException.mutateAsync,
    decideException: decideException.mutateAsync,
    closeException: closeException.mutateAsync,
    addPhoto: addPhoto.mutateAsync,
  };
}
