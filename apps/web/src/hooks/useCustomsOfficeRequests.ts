"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";

export type CustomsOfficeRequestItem = interfaces.CustomsOfficeRequestItem;

// Changing a shipment's chosen Customs Office: a regular user asks on the shipment, a manager
// answers in the Warehouse Managers page's Approvals tab, and the answer reaches the one who asked
// under the bell.

const keys = {
  list: ["customs-office-requests"] as const,
  answers: ["customs-office-request-answers"] as const,
  shipment: (shipmentId: string) => ["customs-office-request", shipmentId] as const,
};

/** The Customs Office row: the shipment's newest request, and asking for a change. */
export const useCustomsOfficeRequest = (shipmentId: string, enabled: boolean) => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: keys.shipment(shipmentId),
    queryFn: async () => (await api.shipments.customsOfficeRequestLatest(shipmentId)).request,
    enabled: enabled && !!shipmentId,
  });
  const ask = useMutation({
    mutationFn: (request: { toOffice: string; reason: string }) => api.shipments.customsOfficeRequestAsk(shipmentId, request),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.shipment(shipmentId) });
      queryClient.invalidateQueries({ queryKey: keys.list });
    },
  });
  return { request: query.data ?? null, ask };
};

/** The Approvals tab: what waits, and what was answered in the last 30 days (managers only). */
export const useCustomsOfficeApprovals = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: keys.list,
    queryFn: async () => (await api.shipments.customsOfficeRequestList()).requests,
    refetchInterval: 60_000,
  });
  const decide = useMutation({
    mutationFn: ({ id, ...answer }: { id: string; shipmentId: string; approve: boolean; comment: string }) =>
      api.shipments.customsOfficeRequestDecide(id, { approve: answer.approve, comment: answer.comment }),
    onSettled: (_data, _err, { shipmentId }) => {
      queryClient.invalidateQueries({ queryKey: keys.list });
      queryClient.invalidateQueries({ queryKey: keys.shipment(shipmentId) });
      // An approved office is now on the shipment.
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
    },
  });
  const requests = query.data ?? [];
  return {
    requests,
    waiting: requests.filter((r) => r.status === "pending").length,
    isLoading: query.isLoading,
    // A failed load must not read as "nothing to answer".
    isError: query.isError && !query.data,
    decide,
  };
};

/** The bell: the answers to the signed-in user's own requests. */
export const useCustomsOfficeAnswers = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: keys.answers,
    queryFn: async () => (await api.shipments.customsOfficeRequestAnswers()).answers,
    refetchInterval: 30_000,
  });
  const seen = useMutation({
    mutationFn: (id: string) => api.shipments.customsOfficeRequestSeen(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.answers }),
  });
  return { answers: query.data ?? [], hasLoaded: query.data !== undefined, seen };
};
