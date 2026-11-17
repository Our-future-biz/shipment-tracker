"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { interfaces } from "@/lib/api/client";

export type ShipmentNote = interfaces.ShipmentNoteItem;
export type CoverNotesNotice = interfaces.CoverNotesNotice;

const key = (shipmentId: string) => ["shipment-notes", shipmentId];
const COVER_BELL_KEY = ["cover-notes-bell"] as const;

/** The shipment's notepad: its notes, how many are still open, and the ways to change them. */
export function useShipmentNotes(shipmentId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({
    queryKey: key(shipmentId),
    queryFn: () => api.shipments.noteList(shipmentId),
    enabled: !!shipmentId,
  });
  const notes = data?.notes ?? [];
  // The bell lists a shipment someone was made to cover while it has open to-dos: the last one finished ends it.
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: COVER_BELL_KEY });
    return queryClient.invalidateQueries({ queryKey: key(shipmentId) });
  };
  const failed = (what: string) => (e: unknown) => toast.error(`${what}: ${apiErrorMessage(e)}`);

  const add = useMutation({
    mutationFn: (input: { text: string; details?: string; dueDate?: string }) => api.shipments.noteCreate(shipmentId, input),
    onSuccess: refresh,
    onError: failed("Could not add the note"),
  });
  const change = useMutation({
    mutationFn: ({ id, ...input }: { id: string; text?: string; details?: string; dueDate?: string; done?: boolean; pinned?: boolean }) => api.shipments.noteUpdate(shipmentId, id, input),
    onSuccess: refresh,
    onError: failed("Could not save the note"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.shipments.noteDelete(shipmentId, id),
    onSuccess: refresh,
    onError: failed("Could not delete the note"),
  });

  return {
    notes,
    openCount: notes.filter((n) => !n.done).length,
    isLoading,
    add,
    change,
    remove,
  };
}

/**
 * The bell: shipments somebody else made this user the Handled By or Holiday Cover of, with their
 * open to-dos, until the user opens the shipment's Notes To-Do tab. Polled like the bell's other requests.
 */
export function useCoverNotesBell() {
  const query = useQuery({
    queryKey: COVER_BELL_KEY,
    queryFn: async () => (await api.shipments.coverNotesForMe()).notices,
    refetchInterval: 30_000,
  });
  return { notices: query.data ?? [], hasLoaded: query.data !== undefined };
}

/** The shipment's Notes To-Do tab was opened, from the bell's line or the shipment: the bell lists it no longer. */
export function useCoverNotesMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shipmentId: string) => api.shipments.coverNotesMarkRead(shipmentId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: COVER_BELL_KEY }),
  });
}
