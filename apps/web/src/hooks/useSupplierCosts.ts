"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";

export type SupplierCostLine = interfaces.SupplierCostLine;
export type SupplierCosts = interfaces.SupplierCostsResponse;

const NONE: SupplierCosts = {
  owed: [],
  expected: [],
  untracked: [],
  totals: [],
  counts: { owed: 0, expected: 0, untracked: 0, withoutAmount: 0, dueUnknown: 0 },
  paymentDays: null,
  typedNames: [],
  truncated: false,
};

// A supplier's buying lines not yet paid in the shipments' Costs Breakdown, with the totals over all of
// them, and the typed vendor names that name it without a link (What we owe, Council Outlay 7 step 6b).
// Read again on each visit and after a cost line is changed.
export function useSupplierCosts(customerId: string) {
  const query = useQuery({
    queryKey: ["supplier-costs", customerId],
    queryFn: () => api.invoicing.invoicingSupplierCosts(customerId),
    enabled: !!customerId,
  });
  return { costs: query.data ?? NONE, isLoading: query.isLoading, isError: query.isError };
}
