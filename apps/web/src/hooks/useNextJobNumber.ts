"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * The job number the next shipment would get, for display. Generated on the server so it accounts
 * for archived (soft-deleted) shipments; read afresh each time it is needed. Only a preview: the
 * server gives the number out when the shipment is stored, so a parallel create may take it first.
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
