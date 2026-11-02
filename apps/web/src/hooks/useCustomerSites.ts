"use client";

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { customerAddressesKey, customerSitesKey } from "./customerKeys";

export type CustomerSiteItem = interfaces.CustomerSiteItem;

/** A customer's sites through the shared cache (the dialogs that prefill stops read them once). */
export const fetchCustomerSites = (queryClient: QueryClient, customerId: string) =>
  queryClient.fetchQuery({ queryKey: customerSitesKey(customerId), queryFn: () => api.customers.customerSiteList(customerId) });

export const useCustomerSites = (customerId: string) => {
  const queryClient = useQueryClient();
  const key = customerSitesKey(customerId);

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.customers.customerSiteList(customerId),
    enabled: !!customerId,
  });

  // A site is a Pickup / Delivery address of the customer, which may also be its Registered one.
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: customerAddressesKey(customerId) });
    void queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
    return queryClient.invalidateQueries({ queryKey: key });
  };

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
