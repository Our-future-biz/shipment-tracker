"use client";

import { useMemo } from "react";
import { useCustomers, type CustomerItem } from "./useCustomers";

/**
 * The company's suppliers (every company with a supplier role) for the pickers on quote buying lines and
 * shipment costs, read once and shared: every picker on a page uses the same list, so typing asks nothing
 * of the server. With each supplier's rating by its id, for the stars beside a picked one.
 */
export function useSupplierDirectory() {
  const { customers } = useCustomers({ kind: "suppliers" });
  const byId = useMemo(() => new Map<string, CustomerItem>(customers.map((c) => [c.id, c])), [customers]);
  return { suppliers: customers, byId };
}
