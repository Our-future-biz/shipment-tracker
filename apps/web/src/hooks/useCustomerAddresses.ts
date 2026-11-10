"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { customerAddressesKey, customerSitesKey } from "./customerKeys";
import { invalidateInvoicingDerived } from "./useInvoiceQueue";

export type AddressItem = interfaces.AddressItem;

export const useCustomerAddresses = (customerId: string) => {
  const queryClient = useQueryClient();
  const key = customerAddressesKey(customerId);

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.customers.addressList(customerId),
    enabled: !!customerId,
  });

  // The Registered address is also the customer's registered address (header, Registry card), so
  // the customer and the list are refreshed with it; a Pickup / Delivery address is also a site. The
  // invoice previews are read again too: an invoice is addressed to the Billing address.
  const invalidate = () => {
    invalidateInvoicingDerived(queryClient);
    void queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
    void queryClient.invalidateQueries({ queryKey: customerSitesKey(customerId) });
    void queryClient.invalidateQueries({ queryKey: ["customers"] });
    return queryClient.invalidateQueries({ queryKey: key });
  };

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

  // Billing moves to this address from the one that had it (invoices are addressed to it).
  const makeBillingMutation = useMutation({
    mutationFn: (id: string) => api.customers.addressMakeBilling(id),
    onSuccess: invalidate,
  });

  return {
    addresses: query.data?.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    createAddress: createMutation.mutateAsync,
    updateAddress: updateMutation.mutateAsync,
    deleteAddress: deleteMutation.mutateAsync,
    makeBilling: makeBillingMutation.mutateAsync,
  };
};
