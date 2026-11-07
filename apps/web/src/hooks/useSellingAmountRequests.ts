"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api";

export type SellingAmountRequest = interfaces.SellingAmountRequestItem;

// Selling a cost on for less than it costs (a master job's demurrage): asked on the shipment's Costs
// Breakdown with a reason, answered on Sales → Managers → Quote inquiries.

export const sellingAmountRequestKeys = {
  all: ["selling-amount-requests"] as const,
  list: ["selling-amount-requests", "list"] as const,
  forMe: ["selling-amount-requests", "for-me"] as const,
  shipment: (shipmentId: string) => ["selling-amount-requests", "shipment", shipmentId] as const,
};

/** A shipment's requests, newest first, and the asking. A waiting one is asked about again: the answer changes the row. */
export const useShipmentSellingAmountRequests = (shipmentId: string, enabled: boolean) => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: sellingAmountRequestKeys.shipment(shipmentId),
    queryFn: async () => (await api.invoicing.invoicingSellingAmountRequestsOfShipment(shipmentId)).requests,
    enabled,
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "pending") ? 30_000 : false),
  });
  const done = () => queryClient.invalidateQueries({ queryKey: sellingAmountRequestKeys.all });
  const change = useMutation({
    mutationFn: ({ sellingId, amount, reason }: { sellingId: string; amount: string; reason?: string }) =>
      api.invoicing.invoicingSellingAmountChange(shipmentId, sellingId, { amount, reason }),
    onSettled: done,
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => api.invoicing.sellingAmountRequestWithdraw(id),
    onSettled: done,
  });
  return { requests: query.data ?? [], change, withdraw };
};

/** The managers' list: what waits and what was answered in the last 30 days, and their answer. */
export const useSellingAmountRequests = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: sellingAmountRequestKeys.list,
    queryFn: async () => (await api.invoicing.sellingAmountRequestList()).requests,
    refetchInterval: 60_000,
  });
  const decide = useMutation({
    mutationFn: ({ id, ...answer }: { id: string; decision: "approve" | "reject"; comment?: string }) => api.invoicing.sellingAmountRequestDecide(id, answer),
    onSettled: () => queryClient.invalidateQueries({ queryKey: sellingAmountRequestKeys.all }),
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

/** The bell: requests waiting, for a manager, and answers to what the user asked. */
export const useSellingAmountBell = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: sellingAmountRequestKeys.forMe,
    queryFn: () => api.invoicing.sellingAmountRequestForMe(),
    refetchInterval: 30_000,
  });
  const seen = useMutation({
    mutationFn: (ids: string[]) => api.invoicing.sellingAmountRequestSeen({ ids }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: sellingAmountRequestKeys.forMe }),
  });
  return { waiting: query.data?.waiting ?? [], answers: query.data?.answers ?? [], hasLoaded: query.data !== undefined, seen };
};
