"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { interfaces } from "@/lib/api/client";

export type ShipmentNote = interfaces.ShipmentNoteItem;

const key = (shipmentId: string) => ["shipment-notes", shipmentId];

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
  const refresh = () => queryClient.invalidateQueries({ queryKey: key(shipmentId) });
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
