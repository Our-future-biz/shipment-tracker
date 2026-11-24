"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DEFAULT_RULES, NO_ROAD_WEIGHT, type PlanRules } from "@/app/loading-planner/_lib/containers";

const KEY = ["loading-planner-settings"];

/**
 * The Loading Planner's settings of the company: the clearance left free in standard containers,
 * the limits out-of-gauge cargo is warned about above, the weights of a heavy single piece, and
 * the gross weight a plan warns about the road leg from.
 * Until they are read (or if they cannot be), plans are worked out with the starting figures.
 */
export const usePlannerSettings = () => {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: () => api.loadingPlanner.plannerSettingsGet() });
  const save = useMutation({
    mutationFn: (settings: PlanRules) => api.loadingPlanner.plannerSettingsSet({ settings: { ...settings, roadWeight: settings.roadWeight ?? NO_ROAD_WEIGHT } }),
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
  });
  return {
    rules: query.data?.settings ?? DEFAULT_RULES,
    /** A manager changed the figures; false while the company plans with the starting ones. */
    changed: query.data?.changed ?? false,
    canEdit: query.data?.canEdit ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
    saveRules: save.mutateAsync,
    isSaving: save.isPending,
  };
};
