"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";

const LOADING_PLANS_KEY = ["loading-plans"];

/** A shipment or quote whose plans are wanted; leave out for all plans of the company. */
export interface PlanLink {
  kind: interfaces.PlanLinkKind;
  id: string;
}

/** The saved loading plans (all, or those of one job) and the writes on them. */
export const useLoadingPlans = (link?: PlanLink) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...LOADING_PLANS_KEY, "list", link?.kind ?? "", link?.id ?? ""],
    queryFn: () => api.loadingPlanner.loadingPlanList(link ? { linkKind: link.kind, linkId: link.id } : {}),
  });

  // Every list and every opened plan shows what a save or a delete changed.
  const invalidate = () => queryClient.invalidateQueries({ queryKey: LOADING_PLANS_KEY });

  const createMutation = useMutation({
    mutationFn: (params: controllers.LoadingPlanCreateRequest) => api.loadingPlanner.loadingPlanCreate(params),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...params }: controllers.LoadingPlanUpdateRequest & { id: string }) => api.loadingPlanner.loadingPlanUpdate(id, params),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.loadingPlanner.loadingPlanDelete(id),
    onSuccess: invalidate,
  });

  return {
    plans: query.data?.plans ?? [],
    isLoading: query.isLoading,
    isError: query.isLoadingError,
    createPlan: async (params: controllers.LoadingPlanCreateRequest) => (await createMutation.mutateAsync(params)).plan,
    updatePlan: async (params: controllers.LoadingPlanUpdateRequest & { id: string }) => (await updateMutation.mutateAsync(params)).plan,
    deletePlan: deleteMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending,
  };
};

/** One saved plan with its cargo. */
export const useLoadingPlan = (id: string | null) => {
  const query = useQuery({
    queryKey: [...LOADING_PLANS_KEY, "plan", id],
    queryFn: async () => (await api.loadingPlanner.loadingPlanGet(id ?? "")).plan,
    enabled: !!id,
  });
  return { plan: query.data ?? null, isLoading: query.isLoading, error: query.error };
};
