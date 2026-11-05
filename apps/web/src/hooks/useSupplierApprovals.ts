"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api";
import { refreshCustomerLists } from "./useCustomers";

export type SupplierApprovalItem = interfaces.SupplierApprovalItem;

// A new supplier a user who is no manager adds from a quote's Pricing waits for a manager on Sales →
// Managers → Company approval. The one list serves the managers' tab, the bell (a manager is told what
// waits, the one who asked the answer) and the supplier fields (a declined supplier says why).

export const supplierApprovalKeys = { all: ["supplier-approvals"] as const };

export const useSupplierApprovals = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: supplierApprovalKeys.all,
    queryFn: async () => (await api.customers.supplierApprovalList()).approvals,
    refetchInterval: 60_000,
    enabled,
  });
  const decide = useMutation({
    mutationFn: ({ id, ...answer }: { id: string; decision: "approve" | "decline"; comment?: string }) => api.customers.supplierApprovalDecide(id, answer),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: supplierApprovalKeys.all });
      // Approved it is offered as any supplier; declined it leaves the Customer Database.
      refreshCustomerLists(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["deleted-customers"] });
    },
  });
  const seen = useMutation({
    mutationFn: (ids: string[]) => api.customers.supplierApprovalSeen({ ids }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: supplierApprovalKeys.all }),
  });
  const approvals = query.data ?? NONE;
  const declined = useMemo(() => new Map(approvals.filter((a) => a.status === "declined").map((a) => [a.customerId, a])), [approvals]);
  return {
    approvals,
    waiting: approvals.filter((a) => a.status === "pending").length,
    /** Declined suppliers by id: a line still linked to one says why. */
    declined,
    hasLoaded: query.data !== undefined,
    isLoading: query.isLoading,
    // A failed load must not read as "nothing to answer".
    isError: query.isError && !query.data,
    decide,
    seen,
  };
};

const NONE: SupplierApprovalItem[] = [];
