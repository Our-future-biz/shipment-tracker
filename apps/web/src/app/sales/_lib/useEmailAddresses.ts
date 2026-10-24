"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

const KEY = ["sales-email-addresses"];

// The addresses the signed-in user emailed quotations to, the latest first, read while the Email
// dialog is open. Those a message is handed over to are remembered; one can be taken off.
export function useEmailAddresses(enabled: boolean) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: () => api.sales.emailAddressesGet(), enabled });
  const store = { onSuccess: (stored: { data: string[] }) => queryClient.setQueryData(KEY, stored) };
  const used = useMutation({ mutationFn: (addresses: string[]) => api.sales.emailAddressesUsed({ addresses }), ...store });
  const forget = useMutation({ mutationFn: (address: string) => api.sales.emailAddressForget({ address }), ...store });
  return { list: query.data?.data ?? [], used, forget };
}
