"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";

/** Every query of loading plans starts with this: the lists (all, or one job's) and the opened plans. */
export const LOADING_PLANS_KEY = ["loading-plans"];

/**
 * After a write elsewhere that moved plans (a quote revised: its plans go to the revision), every
 * list and opened plan is marked out of date without being read now; each is read again when it is
 * next shown, the revision's own card among them.
 */
export const markLoadingPlansStale = (queryClient: QueryClient) => queryClient.invalidateQueries({ queryKey: LOADING_PLANS_KEY, refetchType: "none" });

/** A shipment or quote whose plans are wanted; leave out for all plans of the company. */
export interface PlanLink {
  kind: interfaces.PlanLinkKind;
  id: string;
}

/**
 * Saving and deleting plans. Every list and every opened plan is marked out of date after a write;
 * the write itself does not wait for them to be read again.
 */
export const useLoadingPlanWrites = () => {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: LOADING_PLANS_KEY });

  const createMutation = useMutation({
    mutationFn: (params: controllers.LoadingPlanCreateRequest) => api.loadingPlanner.loadingPlanCreate(params),
    onSuccess: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, ...params }: controllers.LoadingPlanUpdateRequest & { id: string }) => api.loadingPlanner.loadingPlanUpdate(id, params),
    // A refused save most often means a colleague saved first: the plan is read again, so its page can offer their version.
    onSettled: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.loadingPlanner.loadingPlanDelete(id),
    onSuccess: invalidate,
  });

  return {
    createPlan: async (params: controllers.LoadingPlanCreateRequest) => (await createMutation.mutateAsync(params)).plan,
    updatePlan: async (params: controllers.LoadingPlanUpdateRequest & { id: string }) => (await updateMutation.mutateAsync(params)).plan,
    deletePlan: deleteMutation.mutateAsync,
    isSaving: createMutation.isPending || updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
};

/** The saved loading plans: all of the company's, or those of one job. */
export const useLoadingPlans = (link?: PlanLink) => {
  const query = useQuery({
    queryKey: [...LOADING_PLANS_KEY, "list", link?.kind ?? "", link?.id ?? ""],
    queryFn: () => api.loadingPlanner.loadingPlanList(link ? { linkKind: link.kind, linkId: link.id } : {}),
  });
  return {
    plans: query.data?.plans ?? [],
    /** There are more plans than the list shows. */
    capped: query.data?.capped ?? false,
    isLoading: query.isLoading,
    isError: query.isLoadingError,
  };
};

/**
 * One saved plan with its cargo. It is read anew each time its page opens, however fresh the copy
 * kept in the browser: a colleague may have saved it in the meantime.
 */
export const useLoadingPlan = (id: string | null) => {
  const query = useQuery({
    queryKey: [...LOADING_PLANS_KEY, "plan", id],
    queryFn: async () => (await api.loadingPlanner.loadingPlanGet(id ?? "")).plan,
    enabled: !!id,
    refetchOnMount: "always",
    staleTime: 0,
  });
  return { plan: query.data ?? null, isLoading: query.isLoading, error: query.error };
};
