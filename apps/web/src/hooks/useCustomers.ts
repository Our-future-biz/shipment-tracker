"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { customerQuotesKeys } from "@/hooks/salesQueryKeys";
import { customerAddressesKey } from "@/hooks/useCustomerAddresses";

export type CustomerItem = interfaces.CustomerItem;

export interface CustomerQueryParams {
  /** Free-text search, executed server-side across company name, IČO, DIČ and city. */
  search?: string;
  status?: interfaces.CustomerStatus;
  label?: interfaces.CustomerLabel;
  country?: string;
}

// Query keys that hold one customer's record and its lists (see the useCustomer* hooks).
const CUSTOMER_RECORD_KEYS = [
  "customer",
  "customer-contacts",
  "customer-notes",
  "customer-documents",
  "customer-invoices",
  "customer-shipments",
  customerAddressesKey("")[0],
  customerQuotesKeys.all[0],
];

// One shared empty list, so "nothing loaded" does not look like new data on every render.
const NO_CUSTOMERS: CustomerItem[] = [];

// With `enabled: false` nothing is asked: a picker that searches as its user types has no reason
// to download the whole customer database before anything was typed.
export const useCustomers = (params: CustomerQueryParams = {}, { enabled = true } = {}) => {
  const queryClient = useQueryClient();

  const search = params.search?.trim() || undefined;
  const { status, label, country } = params;

  // Filters are applied server-side (scoped to the company) so they cover the whole
  // customer database rather than only the rows already loaded in the browser.
  const query = useQuery({
    queryKey: ["customers", search ?? "", status ?? "", label ?? "", country ?? ""],
    queryFn: () => api.customers.customerList({ search, status, label, country }),
    placeholderData: (prev) => prev,
    enabled,
  });

  // Not awaited: creating a customer must not wait for the whole list to download again.
  const refreshList = () => {
    queryClient.invalidateQueries({ queryKey: ["customers"] });
  };

  const createMutation = useMutation({
    mutationFn: (params: controllers.CustomerCreateRequest) => api.customers.customerCreate(params),
    onSuccess: refreshList,
  });

  // A company outside the Czech Republic, typed in by hand.
  const createManualMutation = useMutation({
    mutationFn: (params: controllers.CustomerCreateManualRequest) => api.customers.customerCreateManual(params),
    onSuccess: refreshList,
  });

  return {
    customers: query.data?.data ?? NO_CUSTOMERS,
    // True during every request, including a filter change where the previous rows stay on screen (placeholderData).
    isFetching: query.isFetching,
    isError: query.isError,
    createCustomer: createMutation.mutateAsync,
    createManualCustomer: createManualMutation.mutateAsync,
    isCreating: createMutation.isPending || createManualMutation.isPending,
  };
};

export const useCustomer = (id: string | null) => {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => api.customers.customerDelete(id as string),
    onSuccess: () => {
      // Drop everything cached about the record: a failed refetch keeps the last good data, so
      // Back or a link from one of its shipments would otherwise show the deleted customer as live.
      for (const key of CUSTOMER_RECORD_KEYS) queryClient.removeQueries({ queryKey: [key, id] });
      return queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });

  const query = useQuery({
    queryKey: ["customer", id],
    queryFn: () => api.customers.customerGet(id as string),
    // After this instance deleted the record its cache entry is gone; do not request it again
    // (a guaranteed 404) while the page navigates away.
    enabled: !!id && !deleteMutation.isSuccess,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["customer", id] });
    queryClient.invalidateQueries({ queryKey: ["customers"] });
  };

  // The saved row is put in the cache straight away, so a field shows the new value without
  // flicking back to the old one until the refetch lands.
  const updateMutation = useMutation({
    mutationFn: (params: controllers.CustomerUpdateRequest) => api.customers.customerUpdate(id as string, params),
    onSuccess: (res) => {
      queryClient.setQueryData<controllers.CustomerGetResponse>(["customer", id], (prev) => (prev ? { ...prev, customer: res.customer } : prev));
      invalidate();
    },
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
    // A failed load (not a missing record) — the page offers a retry instead of "not found".
    isLoadError: query.isError && !query.data && (query.error as { status?: number } | null)?.status !== 404,
    refetch: query.refetch,
    updateCustomer: updateMutation.mutateAsync,
    deleteCustomer: deleteMutation.mutateAsync,
    uploadLogo: uploadLogoMutation.mutateAsync,
    deleteLogo: deleteLogoMutation.mutateAsync,
  };
};
