"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";

export type SupplierCostLine = interfaces.SupplierCostLine;
export type SupplierTypedName = interfaces.SupplierTypedName;

const NO_LINES: SupplierCostLine[] = [];
const NO_NAMES: SupplierTypedName[] = [];

// A supplier's buying lines not yet paid in the shipments' Costs Breakdown, and the typed vendor
// names that name it without a link (What we owe, Council Outlay 7 step 6b). Read again on each visit.
export function useSupplierCosts(customerId: string) {
  const query = useQuery({
    queryKey: ["supplier-costs", customerId],
    queryFn: () => api.invoicing.invoicingSupplierCosts(customerId),
    enabled: !!customerId,
  });
  return {
    lines: query.data?.lines ?? NO_LINES,
    typedNames: query.data?.typedNames ?? NO_NAMES,
    truncated: query.data?.truncated ?? false,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
