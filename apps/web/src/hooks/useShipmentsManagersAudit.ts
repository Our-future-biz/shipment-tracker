"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api";

export type ManagersAuditList = interfaces.ManagersAuditList;
export type ManagersAuditRow = interfaces.ManagersAuditRow;

/**
 * Shipments → Managers, the audit line's drill-down: the rows behind one of its counts (which job,
 * who, when, what) over the line's seven days, the newest first, at most 200. Asked only while its
 * dialog is open (`key` null asks nothing), and again each time it opens: the line's count is read
 * every minute, and the rows should not be older than the count that led to them.
 */
export const useShipmentsManagersAudit = (key: string | null) => {
  const query = useQuery({
    // Beside the cockpit's own key, not under it: an action that refreshes the cockpit need not re-read an open list.
    queryKey: ["shipments-managers-audit", key] as const,
    queryFn: () => api.shipments.shipmentManagersAudit({ key: key ?? "" }),
    enabled: key !== null,
    staleTime: 0,
  });
  return {
    list: query.data ?? null,
    isLoading: query.isLoading,
    // A failed read is not "nothing happened".
    isError: query.isError && !query.data,
  };
};
