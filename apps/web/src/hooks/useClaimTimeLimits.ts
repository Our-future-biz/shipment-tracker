"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import { MANAGERS_COCKPIT_KEY } from "@/hooks/useShipmentManagerActions";

export type ClaimTimeLimitsSettings = interfaces.ClaimTimeLimitsSettings;

// The company's claim time limits (Council Outlay 11, D21), on Shipments → Managers → Settings:
// read and kept by managers, admins and superadmins. Off until a manager confirms the numbers.

const KEY = ["claim-time-limits"] as const;

export const useClaimTimeLimits = (enabled = true) => {
  const query = useQuery({ queryKey: KEY, queryFn: () => api.shipments.claimTimeLimitsGet(), enabled });
  return { settings: query.data ?? null, isLoading: enabled && query.isPending, isError: query.isError && !query.data };
};

/**
 * Save the switch and the numbers. What they change is read again: the Cockpit's claim signals and
 * the deadlines on every job's Claims tab.
 */
export const useClaimTimeLimitsSave = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: controllers.ClaimTimeLimitsSaveRequest) => api.shipments.claimTimeLimitsSave(request),
    onSuccess: (saved) => queryClient.setQueryData(KEY, saved),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: MANAGERS_COCKPIT_KEY });
      queryClient.invalidateQueries({ queryKey: ["shipment-claims"] });
    },
  });
};
