"use client";

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { customerQuotesKeys } from "@/hooks/salesQueryKeys";
import { customerAddressesKey } from "@/hooks/useCustomerAddresses";
import { refreshShipmentCopies } from "@/hooks/useShipments";
import { refreshQuoteCopies } from "@/hooks/useSalesQuotes";
import { railTariffKeys } from "@/hooks/useRailTariffs";
import { collectionTariffKeys } from "@/hooks/useCollectionTariffs";
import { oceanTariffKeys } from "@/hooks/useOceanTariffs";

export type CustomerItem = interfaces.CustomerItem;
export type DeletedCustomerItem = interfaces.DeletedCustomerItem;

const DELETED_CUSTOMERS_KEY = "deleted-customers";

export interface CustomerQueryParams {
  /** Free-text search, executed server-side across company name, IČO, DIČ and city. */
  search?: string;
  status?: interfaces.CustomerStatus;
  label?: interfaces.CustomerLabel;
  country?: string;
  /** Only companies with this role (e.g. hauliers). */
  role?: interfaces.CustomerRole;
}

// Query keys that hold one customer's record and its lists (see the useCustomer* hooks).
const CUSTOMER_RECORD_KEYS = [
  "customer",
  "customer-contacts",
  "customer-sites",
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
  const { status, label, country, role } = params;

  // Filters are applied server-side (scoped to the company) so they cover the whole
  // customer database rather than only the rows already loaded in the browser.
  const query = useQuery({
    queryKey: ["customers", search ?? "", status ?? "", label ?? "", country ?? "", role ?? ""],
    queryFn: () => api.customers.customerList({ search, status, label, country, role }),
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
    // How many customers the search finds in all; the list holds the newest 2000 of them.
    total: query.data?.total ?? 0,
    // True during every request, including a filter change where the previous rows stay on screen (placeholderData).
    isFetching: query.isFetching,
    isError: query.isError,
    createCustomer: createMutation.mutateAsync,
    createManualCustomer: createManualMutation.mutateAsync,
    isCreating: createMutation.isPending || createManualMutation.isPending,
  };
};

// The Tariffs pages list the companies by their supplier roles and show their names as the
// Customer Database has them: a company's new roles, name or deletion shows there at once.
const refreshTariffSuppliers = (queryClient: QueryClient) => {
  for (const key of [railTariffKeys.all, collectionTariffKeys.all, oceanTariffKeys.all]) queryClient.invalidateQueries({ queryKey: key });
};

export const useCustomer = (id: string | null) => {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => api.customers.customerDelete(id as string),
    onSuccess: () => {
      // Drop everything cached about the record: a failed refetch keeps the last good data, so
      // Back or a link from one of its shipments would otherwise show the deleted customer as live.
      for (const key of CUSTOMER_RECORD_KEYS) queryClient.removeQueries({ queryKey: [key, id] });
      queryClient.invalidateQueries({ queryKey: [DELETED_CUSTOMERS_KEY] });
      refreshTariffSuppliers(queryClient);
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
      // A new name or account type reaches the shipments, open quotes and follow-ups that copy it
      // (on the server, a moment later): those lists are read again once that has happened.
      refreshShipmentCopies(queryClient);
      refreshQuoteCopies(queryClient);
      refreshTariffSuppliers(queryClient);
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

const NO_DELETED_CUSTOMERS: DeletedCustomerItem[] = [];

// The deleted (hidden) customers and their restore: superadmins only, so the list is asked for
// only when `enabled` (the API refuses everyone else).
export const useDeletedCustomers = (enabled: boolean) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [DELETED_CUSTOMERS_KEY],
    queryFn: () => api.customers.customerDeletedList(),
    enabled,
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.customers.customerRestore(id),
    onSuccess: (_res, id) => {
      // Whatever was cached about the record while it was deleted (a "not found") goes; and every
      // list that shows customers (pickers, pipeline, hauliers) is read again with it back in.
      for (const key of CUSTOMER_RECORD_KEYS) queryClient.removeQueries({ queryKey: [key, id] });
      return queryClient.invalidateQueries();
    },
  });

  return {
    deletedCustomers: query.data?.data ?? NO_DELETED_CUSTOMERS,
    isLoading: query.isLoading,
    isError: query.isError,
    restoreCustomer: restoreMutation.mutateAsync,
  };
};
