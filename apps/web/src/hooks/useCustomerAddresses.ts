"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";

export type AddressItem = interfaces.AddressItem;

const customerAddressesKey = (customerId: string) => ["customers", customerId, "addresses"] as const;

export const useCustomerAddresses = (customerId: string) => {
  const queryClient = useQueryClient();
  const key = customerAddressesKey(customerId);

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.customers.addressList(customerId),
    enabled: !!customerId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const createMutation = useMutation({
    mutationFn: (params: Omit<controllers.AddressCreateRequest, "customerId">) => api.customers.addressCreate(customerId, params),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, params }: { id: string; params: Omit<controllers.AddressUpdateRequest, "id"> }) => api.customers.addressUpdate(id, params),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.customers.addressDelete(id),
    onSuccess: invalidate,
  });

  return {
    addresses: query.data?.data ?? [],
    isLoading: query.isLoading,
    createAddress: createMutation.mutateAsync,
    updateAddress: updateMutation.mutateAsync,
    deleteAddress: deleteMutation.mutateAsync,
  };
};
