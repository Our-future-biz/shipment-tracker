"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { refreshTariffSuppliers } from "./useCustomers";
import { truckingKeys } from "./truckingKeys";

export type SupplierRatingEntry = interfaces.SupplierRatingEntry;

// A supplier's 0–5 star rating: every change kept (the history), and setting or clearing it (managers
// only, the server checks). The saved company goes straight into the cache, as an edit of its fields does.
export const useSupplierRating = (customerId: string, { historyEnabled = true } = {}) => {
  const queryClient = useQueryClient();
  const historyKey = ["customer-supplier-rating", customerId];

  const history = useQuery({
    queryKey: historyKey,
    queryFn: () => api.customers.supplierRatingHistory(customerId),
    enabled: !!customerId && historyEnabled,
  });

  const setMutation = useMutation({
    mutationFn: (params: controllers.SupplierRatingSetRequest) => api.customers.supplierRatingSet(customerId, params),
    onSuccess: (res) => {
      queryClient.setQueryData<controllers.CustomerGetResponse>(["customer", customerId], (prev) => (prev ? { ...prev, customer: res.customer } : prev));
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: historyKey });
      // Where the stars are shown outside the Customer Database: Trucking's hauliers (every haulier
      // picker reads that list) and the Tariffs suppliers and offers.
      queryClient.invalidateQueries({ queryKey: truckingKeys.haulierList() });
      refreshTariffSuppliers(queryClient);
    },
  });

  return {
    history: history.data?.data ?? [],
    historyLoading: history.isLoading,
    historyError: history.isError,
    setRating: setMutation.mutateAsync,
    saving: setMutation.isPending,
  };
};
