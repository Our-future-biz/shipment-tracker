"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DEFAULT_CLEARANCE, type Clearance } from "@/app/loading-planner/_lib/containers";

const KEY = ["loading-planner-settings"];

/**
 * The Loading Planner's settings of the company: the clearance left free in standard containers.
 * Until they are read (or if they cannot be), plans are worked out with the starting figures.
 */
export const usePlannerSettings = () => {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: () => api.loadingPlanner.plannerSettingsGet() });
  const save = useMutation({
    mutationFn: (clearance: Clearance) => api.loadingPlanner.plannerSettingsSet({ clearance }),
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
  });
  return {
    clearance: query.data?.clearance ?? DEFAULT_CLEARANCE,
    /** A manager changed the figures; false while the company plans with the starting ones. */
    changed: query.data?.changed ?? false,
    canEdit: query.data?.canEdit ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    saveClearance: save.mutateAsync,
    isSaving: save.isPending,
  };
};
