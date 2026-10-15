"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { portalApi } from "@/app/haulier/_lib/portalClient";
import type { PortalOrder, PortalStampKind } from "@/app/haulier/_lib/portal";
import { truckingKeys } from "./truckingKeys";

// The haulier portal's data (/haulier/portal), read with the portal session only (portalClient).
// A missing or ended session already sends the browser to the portal login, so nothing is retried.

export function usePortalMe() {
  const query = useQuery({ queryKey: truckingKeys.portalMe(), queryFn: portalApi.me, retry: false, staleTime: 60_000 });
  return { me: query.data?.me ?? null, isLoading: query.isLoading, error: query.error };
}

export function usePortalOrders(view: "open" | "done") {
  const query = useQuery({ queryKey: truckingKeys.portalOrders(view), queryFn: () => portalApi.orders(view), retry: false });
  return { orders: query.data?.orders ?? [], isLoading: query.isLoading, error: query.error, reload: query.refetch, isFetching: query.isFetching };
}

/** One order and what the haulier does on it; every change answers with the order as stored now. */
export function usePortalOrder(id: string) {
  const queryClient = useQueryClient();
  const key = truckingKeys.portalOrder(id);
  const query = useQuery({ queryKey: key, queryFn: () => portalApi.order(id), enabled: !!id, retry: false });

  const onChanged = (res: { order: PortalOrder }) => {
    queryClient.setQueryData(key, res);
    return queryClient.invalidateQueries({ queryKey: [...truckingKeys.portal(), "orders"] });
  };

  const respond = useMutation({ mutationFn: (req: { action: "CONFIRM" | "REJECT"; reason: string }) => portalApi.respond(id, req), onSuccess: onChanged });
  const stamp = useMutation({ mutationFn: (kind: PortalStampKind) => portalApi.stamp(id, { kind, at: null }), onSuccess: onChanged });
  const delivered = useMutation({
    mutationFn: ({ consignmentId, ...req }: { consignmentId: string; at: string | null; receiverName: string }) => portalApi.delivered(id, consignmentId, req),
    onSuccess: onChanged,
  });
  const pod = useMutation({
    mutationFn: ({ consignmentId, ...req }: { consignmentId: string; fileName: string; fileBase64: string; receiverName: string; deliveredAt: string | null }) =>
      portalApi.pod(id, consignmentId, req),
    onSuccess: onChanged,
  });

  return {
    order: query.data?.order ?? null,
    isLoading: query.isLoading,
    error: query.error,
    reload: query.refetch,
    isFetching: query.isFetching,
    loadedAt: query.dataUpdatedAt,
    respond: respond.mutateAsync,
    isResponding: respond.isPending,
    stamp: stamp.mutateAsync,
    stampingKind: stamp.isPending ? stamp.variables : null,
    markDelivered: delivered.mutateAsync,
    isMarkingDelivered: delivered.isPending,
    uploadPod: pod.mutateAsync,
    isUploading: pod.isPending,
  };
}
