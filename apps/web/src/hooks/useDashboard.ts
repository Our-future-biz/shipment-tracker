"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const useDashboard = () => {
  const query = useQuery({
    queryKey: ["shipments-dashboard"],
    queryFn: () => api.shipments.shipmentDashboard(),
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
};
