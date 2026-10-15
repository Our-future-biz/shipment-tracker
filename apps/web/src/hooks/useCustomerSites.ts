"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";

export type CustomerSiteItem = interfaces.CustomerSiteItem;

export const customerSitesKey = (customerId: string) => ["customer-sites", customerId] as const;

export const useCustomerSites = (customerId: string) => {
  const queryClient = useQueryClient();
  const key = customerSitesKey(customerId);

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.customers.customerSiteList(customerId),
    enabled: !!customerId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createMutation = useMutation({
    mutationFn: (params: controllers.CustomerSiteCreateRequest) => api.customers.customerSiteCreate(customerId, params),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, params }: { id: string; params: controllers.CustomerSiteUpdateRequest }) =>
      api.customers.customerSiteUpdate(id, params),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.customers.customerSiteDelete(id),
    onSuccess: invalidate,
  });

  return {
    sites: query.data?.data ?? [],
    isLoading: query.isLoading,
    createSite: createMutation.mutateAsync,
    updateSite: updateMutation.mutateAsync,
    deleteSite: deleteMutation.mutateAsync,
  };
};
