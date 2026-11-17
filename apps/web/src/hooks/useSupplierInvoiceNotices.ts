"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api";
import { supplierInvoiceKeys } from "./supplierInvoiceKeys";

export type PayableNotice = interfaces.PayableNoticeItem;

/**
 * Finance → Accounts Payable for the bell and Sales → Managers → Billing approvals (Council Outlay 9, D10):
 * how many supplier invoices wait for a manager's approval (0 for anyone else; the approving itself is on
 * the Accounts Payable page), and the invoices someone else booked in the last 7 days on the user's jobs,
 * until they open them. Polled like the bell's other requests.
 */
export const useSupplierInvoiceNotices = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: supplierInvoiceKeys.forMe,
    queryFn: () => api.invoicing.supplierInvoiceForMe(),
    refetchInterval: 30_000,
  });
  // Opened from the bell: the server stops listing it, so the bell reads the list again.
  const seen = useMutation({
    mutationFn: (ids: string[]) => api.invoicing.supplierInvoiceSeen({ ids }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: supplierInvoiceKeys.forMe }),
  });
  return {
    toApprove: query.data?.toApprove ?? 0,
    booked: query.data?.booked ?? [],
    hasLoaded: query.data !== undefined,
    isLoading: query.isLoading,
    // A failed load must not read as "nothing to approve".
    isError: query.isError && !query.data,
    seen,
  };
};
