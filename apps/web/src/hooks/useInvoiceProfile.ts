"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { invalidateInvoicingDerived } from "./useInvoiceQueue";

export type InvoiceProfile = interfaces.InvoiceProfileItem;
export type InvoiceProfileInput = controllers.SaveProfileRequest;
export type BankAccount = InvoiceProfile["bankAccounts"][number];

const PROFILE_KEY = ["invoice-profile"];

/** Issuer details printed on invoices (Settings → Organization → Invoicing details). */
export function useInvoiceProfile() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: () => api.invoicing.invoiceProfileGet(),
  });

  const save = useMutation({
    mutationFn: (input: InvoiceProfileInput) => api.invoicing.invoiceProfileSave(input),
    onSuccess: (res) => {
      queryClient.setQueryData(PROFILE_KEY, res);
      // previews show the issuer, and missing details block issuing
      invalidateInvoicingDerived(queryClient);
    },
  });

  return {
    profile: query.data?.profile,
    isLoading: query.isLoading,
    saveProfile: save.mutateAsync,
    isSaving: save.isPending,
  };
}
