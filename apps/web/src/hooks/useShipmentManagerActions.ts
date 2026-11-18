"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { invalidateShipmentDerivedViews } from "@/hooks/useShipments";

export type HandOverResult = interfaces.HandOverResult;
export type NudgeResult = interfaces.NudgeResult;
export type CutoffDismissalItem = interfaces.CutoffDismissalItem;
export type HandledByCount = interfaces.HandledByCount;

// What a manager does from Shipments → Managers (Council Outlay 11, step 3): hands jobs over, nudges a job's
// people, dismisses a missed cut-off. Each of them changes what the cockpit, the Shipments list and its Needs
// Attention show, so each reads them again - whether the write was answered or not (a hand-over that broke off
// half-way has changed some jobs).

/** Every answer of Shipments → Managers, whatever its filter (useShipmentsManagersCockpit keys them under this). */
export const MANAGERS_COCKPIT_KEY = ["shipments-managers-cockpit"] as const;

/** What a manager's action leaves stale: the cockpit, the shipments (lists and a job read on its own), Needs Attention and the tiles. */
export function invalidateAfterManagerAction(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: MANAGERS_COCKPIT_KEY });
  queryClient.invalidateQueries({ queryKey: ["shipments"] });
  invalidateShipmentDerivedViews(queryClient);
}

/** D11: many jobs to a new Handled By, a Holiday Cover, or both. The answer names the jobs left as they were, and why. */
export const useHandOver = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: controllers.ShipmentHandOverRequest) => api.shipments.shipmentHandOver(request),
    onSettled: () => {
      invalidateAfterManagerAction(queryClient);
      // Whoever now covers a job is told of its open to-dos under the bell (useShipmentNotes' cover bell).
      queryClient.invalidateQueries({ queryKey: ["cover-notes-bell"] });
    },
  });
};

/** D17: a to-do on the job and a chat line that tags its Handled By and Holiday Cover. */
export const useNudge = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shipmentId, text, dueDate }: { shipmentId: string; text: string; dueDate: string }) => api.shipments.shipmentNudge(shipmentId, { text, dueDate }),
    onSettled: (_data, _err, { shipmentId }) => {
      invalidateAfterManagerAction(queryClient);
      // The job's Notes To-Do tab (useShipmentNotes) and its chat, with the unread marks and the mentions.
      queryClient.invalidateQueries({ queryKey: ["shipment-notes", shipmentId] });
      queryClient.invalidateQueries({ queryKey: ["shipment-comments"] });
    },
  });
};

const dismissalsKey = (shipmentId: string) => ["cutoff-dismissals", shipmentId] as const;

/** A job's dismissed cut-offs (managers only): the ones that stand, dismissing one more, taking one back. */
export const useCutoffDismissals = (shipmentId: string, enabled: boolean) => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: dismissalsKey(shipmentId),
    queryFn: async () => (await api.shipments.cutoffDismissalList(shipmentId)).dismissals,
    enabled: enabled && !!shipmentId,
    // Read each time the dialog opens: another manager may have taken one back.
    staleTime: 0,
  });
  const changed = () => {
    queryClient.invalidateQueries({ queryKey: dismissalsKey(shipmentId) });
    invalidateAfterManagerAction(queryClient);
  };
  const dismiss = useMutation({
    mutationFn: async (request: controllers.CutoffDismissRequest) => (await api.shipments.cutoffDismiss(shipmentId, request)).dismissal,
    onSettled: changed,
  });
  const takeBack = useMutation({
    mutationFn: (id: string) => api.shipments.cutoffDismissalTakeBack(shipmentId, id),
    onSettled: changed,
  });
  return {
    dismissals: query.data ?? [],
    isLoading: query.isLoading,
    // A failed read must not read as "nothing dismissed".
    isError: query.isError && !query.data,
    dismiss,
    takeBack,
  };
};

/**
 * D13: how many ACTIVE jobs name a person in Handled By and in Holiday Cover - Settings → Users, before a user
 * is deactivated. For managers; read each time it is asked (the jobs change all day), and not tried for long:
 * the dialog says when it could not be read, and the deactivation goes on without it.
 */
export const useHandledByCount = (email: string | null | undefined, enabled: boolean) => {
  const asked = (email ?? "").trim().toLowerCase();
  const query = useQuery({
    queryKey: ["shipments-handled-by-count", asked],
    queryFn: () => api.shipments.shipmentHandledByCount({ email: asked }),
    enabled: enabled && !!asked,
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  });
  return { count: query.data ?? null, isLoading: enabled && !!asked && query.isLoading, isError: query.isError };
};
