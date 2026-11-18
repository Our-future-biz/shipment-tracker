"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// The customer's Finance tab and Accounts Receivable step 7: the work not yet invoiced beside the credit limit. The
// generated client is called directly; the key sits under "receivables", so every write of Accounts Receivable that
// refreshes its views refreshes this too. The customer's statements are Accounts Receivable's own menu
// (CustomerStatementMenu → StatementMenu), so they are downloaded, confirmed and sent the same way as there.

export const customerUnbilledKey = (customerId: string) => ["receivables", "customer-unbilled", customerId] as const;

/** The selling lines with a value on the customer's open jobs that are on no issued invoice, per currency. */
export const useCustomerUnbilled = (customerId: string | null | undefined) =>
  useQuery({
    queryKey: customerUnbilledKey(customerId ?? ""),
    queryFn: () => api.invoicing.receivableCustomerUnbilled(customerId!),
    enabled: !!customerId,
    retry: 1,
  });
