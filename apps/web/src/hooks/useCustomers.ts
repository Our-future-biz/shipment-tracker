"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";

export type CustomerItem = interfaces.CustomerItem;

export interface CustomerQueryParams {
  /** Free-text search, executed server-side across company name, IČO, DIČ and city. */
  search?: string;
  status?: string;
  label?: string;
  country?: string;
}

export const useCustomers = (params: CustomerQueryParams = {}) => {
  const queryClient = useQueryClient();

  const search = params.search?.trim() || undefined;
  const { status, label, country } = params;

  // Filters are applied server-side (scoped to the company) so they cover the whole
  // customer database rather than only the rows already loaded in the browser.
  const query = useQuery({
    queryKey: ["customers", search ?? "", status ?? "", label ?? "", country ?? ""],
    queryFn: () => api.customers.customerList({ search, status, label, country }),
    placeholderData: (prev) => prev,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["customers"] });

  const createMutation = useMutation({
    mutationFn: (ico: string) => api.customers.customerCreate({ ico }),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, params }: { id: string; params: controllers.CustomerUpdateRequest }) =>
      api.customers.customerUpdate(id, params),
    onSuccess: (res) => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["customer", res.customer.id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.customers.customerDelete(id),
    onSuccess: invalidate,
  });

  return {
    customers: query.data?.data ?? [],
    isLoading: query.isLoading,
    createCustomer: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateCustomer: updateMutation.mutateAsync,
    deleteCustomer: deleteMutation.mutateAsync,
  };
};

export const useCustomer = (id: string | null) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["customer", id],
    queryFn: () => api.customers.customerGet(id as string),
    enabled: !!id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["customer", id] });
    queryClient.invalidateQueries({ queryKey: ["customers"] });
  };

  const updateMutation = useMutation({
    mutationFn: (params: controllers.CustomerUpdateRequest) => api.customers.customerUpdate(id as string, params),
    onSuccess: invalidate,
  });

  const fetchLogoMutation = useMutation({
    mutationFn: () => api.customers.logoFetch(id as string),
    onSuccess: invalidate,
  });

  const uploadLogoMutation = useMutation({
    mutationFn: (dataUrl: string) => api.customers.logoUpload(id as string, { dataUrl }),
    onSuccess: invalidate,
  });

  const deleteLogoMutation = useMutation({
    mutationFn: () => api.customers.logoDelete(id as string),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.customers.customerDelete(id as string),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });

  return {
    customer: query.data?.customer ?? null,
    isLoading: query.isLoading,
    updateCustomer: updateMutation.mutateAsync,
    deleteCustomer: deleteMutation.mutateAsync,
    fetchLogo: fetchLogoMutation.mutateAsync,
    isFetchingLogo: fetchLogoMutation.isPending,
    uploadLogo: uploadLogoMutation.mutateAsync,
    deleteLogo: deleteLogoMutation.mutateAsync,
  };
};
