"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api";
import { approvalStatusChanged } from "@/app/sales/_lib/supplierApproval";
import { refreshCustomerLists } from "./useCustomers";

export type SupplierApprovalItem = interfaces.SupplierApprovalItem;

// A new supplier a user who is no manager adds from a quote's Pricing waits for a manager on Sales →
// Managers → Company approval. The one list serves the managers' tab, the bell (a manager is told what
// waits, the one who asked the answer) and the supplier fields (where a linked supplier stands).

export const supplierApprovalKeys = { all: ["supplier-approvals"] as const };

export const useSupplierApprovals = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: supplierApprovalKeys.all,
    queryFn: async () => {
      const approvals = (await api.customers.supplierApprovalList()).approvals;
      // An answer (or a supplier added, or a decline taken back) seen here first: the Customer Database
      // lists - the pickers and a quote's lines - are read again, so they say the same. Once per read,
      // however many fields use the list.
      if (approvalStatusChanged(queryClient.getQueryData<SupplierApprovalItem[]>(supplierApprovalKeys.all), approvals)) refreshCustomerLists(queryClient);
      return approvals;
    },
    refetchInterval: 60_000,
    enabled,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: supplierApprovalKeys.all });
    // Approved it is offered as any supplier; declined it leaves the Customer Database, taken back it is there again.
    refreshCustomerLists(queryClient);
    void queryClient.invalidateQueries({ queryKey: ["deleted-customers"] });
  };
  const decide = useMutation({
    mutationFn: ({ id, ...answer }: { id: string; decision: "approve" | "decline"; comment?: string }) => api.customers.supplierApprovalDecide(id, answer),
    onSettled: refresh,
  });
  // A decline given by mistake taken back: the supplier waits again, to be approved or declined.
  const undoDecline = useMutation({
    mutationFn: (id: string) => api.customers.supplierApprovalUndoDecline(id),
    onSettled: refresh,
  });
  const seen = useMutation({
    mutationFn: (ids: string[]) => api.customers.supplierApprovalSeen({ ids }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: supplierApprovalKeys.all }),
  });
  const approvals = query.data ?? NONE;
  const byId = useMemo(() => new Map(approvals.map((a) => [a.customerId, a])), [approvals]);
  return {
    approvals,
    waiting: approvals.filter((a) => a.status === "pending").length,
    /** The new suppliers by id, waiting or answered lately: newer than the Customer Database list, so their word wins. */
    byId,
    hasLoaded: query.data !== undefined,
    isLoading: query.isLoading,
    // A failed load must not read as "nothing to answer".
    isError: query.isError && !query.data,
    decide,
    undoDecline,
    seen,
  };
};

const NONE: SupplierApprovalItem[] = [];
