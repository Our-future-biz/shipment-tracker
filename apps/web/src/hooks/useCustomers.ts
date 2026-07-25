"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";

export type CustomerItem = interfaces.CustomerItem;

export const useCustomers = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["customers"],
    queryFn: () => api.customers.customerList(),
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

  return {
    customer: query.data?.customer ?? null,
    isLoading: query.isLoading,
    updateCustomer: updateMutation.mutateAsync,
    fetchLogo: fetchLogoMutation.mutateAsync,
    isFetchingLogo: fetchLogoMutation.isPending,
    uploadLogo: uploadLogoMutation.mutateAsync,
    deleteLogo: deleteLogoMutation.mutateAsync,
  };
};
