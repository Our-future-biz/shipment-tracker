"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { MANAGERS_COCKPIT_KEY } from "@/hooks/useShipmentManagerActions";

export type UserAbsence = interfaces.UserAbsenceItem;

// Users' absences (Council Outlay 11, D12): who is away when, and who covers. Any signed-in user
// reads the company's (colleagues must see who is away); a user records and changes their own, a
// manager, an admin or a superadmin anybody's - the server checks it and says why it refuses.
// Shipments → Managers reads the same absences ("away until", the "Away, no cover" signal), so a
// change reads its answer again too.

/** Every absences answer, whatever it asked for. */
export const ABSENCES_KEY = ["absences"] as const;

/**
 * The absences that end on `since` or later (YYYY-MM-DD; the server's default is 30 days back), of
 * one user or (no `userId`) of everybody in the company; the earliest first.
 */
export const useAbsences = ({ userId, since }: { userId?: string; since?: string }, enabled = true) => {
  const query = useQuery({
    queryKey: [...ABSENCES_KEY, userId ?? "all", since ?? ""],
    queryFn: async () => (await api.auth.absencesList({ userId, since })).absences,
    enabled,
    staleTime: 60_000,
  });
  return {
    absences: query.data ?? [],
    isLoading: enabled && query.isPending,
    // A failed read is not "nobody is away".
    isError: query.isError && !query.data,
  };
};

const invalidateAbsences = (queryClient: QueryClient) => {
  queryClient.invalidateQueries({ queryKey: ABSENCES_KEY });
  queryClient.invalidateQueries({ queryKey: MANAGERS_COCKPIT_KEY });
};

/** Record an absence: `userId` left out records the caller's own. */
export const useAbsenceCreate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: controllers.AbsenceCreateRequest) => (await api.auth.absenceCreate(request)).absence,
    onSettled: () => invalidateAbsences(queryClient),
  });
};

/** Change an absence's days, cover (null clears it) or note. */
export const useAbsenceUpdate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, request }: { id: string; request: controllers.AbsenceUpdateRequest }) => (await api.auth.absenceUpdate(id, request)).absence,
    onSettled: () => invalidateAbsences(queryClient),
  });
};

/** Delete an absence. The cover it set on jobs is taken off by the cover job (where it still stands). */
export const useAbsenceDelete = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.auth.absenceDelete(id),
    onSettled: () => invalidateAbsences(queryClient),
  });
};
