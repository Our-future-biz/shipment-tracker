"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers } from "@/lib/api/client";
import { truckingKeys } from "./truckingKeys";

export type SupplierTermsInput = Omit<controllers.SupplierTermsSetRequest, "id">;

// Saving a supplier's payment terms and VAT / bank details (managers only, the server checks). A
// haulier's go to Trucking in the same save, so its Trucking page and status are read again too.
export const useSupplierTerms = (customerId: string) => {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: SupplierTermsInput) => api.customers.supplierTermsSet(customerId, input),
    onSuccess: (res) => {
      queryClient.setQueryData<controllers.CustomerGetResponse>(["customer", customerId], (prev) => (prev ? { ...prev, customer: res.customer, supplierTermsFromTrucking: false } : prev));
      queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: truckingKeys.haulier(customerId) });
      queryClient.invalidateQueries({ queryKey: truckingKeys.haulierList() });
    },
  });
  return { saveTerms: mutation.mutateAsync, saving: mutation.isPending };
};
