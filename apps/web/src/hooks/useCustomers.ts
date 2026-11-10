"use client";

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { customerQuotesKeys } from "@/hooks/salesQueryKeys";
import { customerAddressesKey } from "@/hooks/customerKeys";
import { refreshShipmentCopies } from "@/hooks/useShipments";
import { refreshQuoteCopies } from "@/hooks/useSalesQuotes";
import { invalidateInvoicingDerived } from "@/hooks/useInvoiceQueue";
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
  /** Only customers, or only suppliers (any role but customer). */
  kind?: interfaces.CustomerListKind;
  /** Only the signed-in user's companies as Sales Owner, or those with none. */
  owner?: interfaces.CustomerOwnerFilter;
  /** Only suppliers of these types. */
  types?: interfaces.CustomerRole[];
  /** Only suppliers of this rating band, or not rated. */
  rating?: interfaces.CustomerRatingFilter;
}

// Query keys that hold one customer's record and its lists (see the useCustomer* hooks).
const CUSTOMER_RECORD_KEYS = [
  "customer",
  "customer-supplier-rating",
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

// The Tariffs pages list the companies by their supplier roles and show their names as the
// Customer Database has them: a company's new roles, name or deletion shows there at once.
export const refreshTariffSuppliers = (queryClient: QueryClient) => {
  for (const key of [railTariffKeys.all, collectionTariffKeys.all, oceanTariffKeys.all]) queryClient.invalidateQueries({ queryKey: key });
};

// After a company is added: the Customer Database lists, and the Tariffs list of each supplier
// role it was given. Not awaited: creating a customer must not wait for the whole list to
// download again.
export const refreshCustomerLists = (queryClient: QueryClient) => {
  queryClient.invalidateQueries({ queryKey: ["customers"] });
  refreshTariffSuppliers(queryClient);
};

/**
 * The cached page with a company just saved put in. A save answers with the company as stored, and for a
 * haulier shown "as Trucking holds them" (supplierTermsFromTrucking) the stored terms are empty: the terms
 * on the page are kept until the refetch, as this save did not change them (they have a save of their own).
 */
export const withSavedCustomer =
  (saved: interfaces.CustomerItem) =>
  (prev: controllers.CustomerGetResponse | undefined): controllers.CustomerGetResponse | undefined =>
    prev ? { ...prev, customer: { ...saved, supplierTerms: prev.customer.supplierTerms } } : prev;

// With `enabled: false` nothing is asked: a picker that searches as its user types has no reason
// to download the whole customer database before anything was typed.
export const useCustomers = (params: CustomerQueryParams = {}, { enabled = true } = {}) => {
  const queryClient = useQueryClient();

  const search = params.search?.trim() || undefined;
  const { status, label, country, role, kind, owner, rating } = params;
  const types = params.types?.length ? params.types.join(",") : undefined;

  // Filters are applied server-side (scoped to the company) so they cover the whole
  // customer database rather than only the rows already loaded in the browser.
  const query = useQuery({
    queryKey: ["customers", search ?? "", status ?? "", label ?? "", country ?? "", role ?? "", kind ?? "", owner ?? "", types ?? "", rating ?? ""],
    queryFn: () => api.customers.customerList({ search, status, label, country, role, kind, owner, types, rating }),
    placeholderData: (prev) => prev,
    enabled,
  });

  const createMutation = useMutation({
    mutationFn: (params: controllers.CustomerCreateRequest) => api.customers.customerCreate(params),
    onSuccess: () => refreshCustomerLists(queryClient),
  });

  // A company outside the Czech Republic, typed in by hand.
  const createManualMutation = useMutation({
    mutationFn: (params: controllers.CustomerCreateManualRequest) => api.customers.customerCreateManual(params),
    onSuccess: () => refreshCustomerLists(queryClient),
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
      queryClient.setQueryData<controllers.CustomerGetResponse>(["customer", id], withSavedCustomer(res.customer));
      invalidate();
      // A new name or account type reaches the shipments, open quotes and follow-ups that copy it
      // (on the server, a moment later): those lists are read again once that has happened.
      refreshShipmentCopies(queryClient);
      refreshQuoteCopies(queryClient);
      refreshTariffSuppliers(queryClient);
      // The customer's country and VAT number set an invoice's default VAT code; its name and seat are on the invoice.
      invalidateInvoicingDerived(queryClient);
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
    /** Whether the signed-in user may set this company's supplier rating (a manager, and it is a supplier). */
    canRateSupplier: query.data?.canRateSupplier ?? false,
    /** Whether the signed-in user may change its payment terms and VAT / bank details (a manager, and it is a supplier). */
    canEditSupplierTerms: query.data?.canEditSupplierTerms ?? false,
    supplierTermsFromTrucking: query.data?.supplierTermsFromTrucking ?? false,
    /** Never saved here and Trucking's copy could not be read: not to be edited until a reload reads it. */
    supplierTermsUnavailable: query.data?.supplierTermsUnavailable ?? false,
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

/** How many companies each view of the list holds (Customers · Suppliers · All); read again with the list. */
export function useCustomerViewCounts({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: ["customers", "view-counts"],
    queryFn: () => api.customers.customerViewCounts(),
    enabled,
  });
  return query.data ?? null;
}
