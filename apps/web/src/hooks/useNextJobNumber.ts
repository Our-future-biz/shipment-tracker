"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * The job number the next shipment gets. Generated on the server so it accounts for archived
 * (soft-deleted) shipments and never reuses a reference; read afresh each time it is needed.
 */
export const useNextJobNumber = (enabled: boolean) => {
  const query = useQuery({
    queryKey: ["shipments", "next-job-number"],
    queryFn: () => api.shipments.shipmentNextJobNumber(),
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
  });
  return { nextJobNumber: query.data?.jobNumber ?? "", isError: query.isError };
};
