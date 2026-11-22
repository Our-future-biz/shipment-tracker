"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { APIError, ErrCode, type controllers, type interfaces } from "@/lib/api/client";
import { SectionChangedError } from "@/hooks/useWarehouseSection";
import { remeasureInformedKey } from "@/lib/informOperations";

export type RemeasureAcceptance = interfaces.RemeasureAcceptance;

/** Kept under ["shipments"], so every write that refreshes the shipments refreshes this too. */
export const remeasureAcceptanceKey = (shipmentId: string) => ["shipments", "remeasure-acceptance", shipmentId];

/**
 * A shipment's last accepted remeasurement (Cargo Details → Accept remeasurement), accepting one,
 * and Costs Breakdown's "Quantities checked" after it.
 */
export function useRemeasureAcceptance(shipmentId: string) {
  const queryClient = useQueryClient();
  const key = remeasureAcceptanceKey(shipmentId);

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.shipments.shipmentRemeasureAcceptance(shipmentId),
    enabled: !!shipmentId,
  });

  const settle = (res: controllers.RemeasureAcceptanceResponse) => queryClient.setQueryData<controllers.RemeasureAcceptanceResponse>(key, { acceptance: res.acceptance });

  // `expected`: the warehouse's remeasured lines as the page shows them. Refused, nothing is
  // accepted, and what it was decided on is read again - the warehouse's lines, and the shipment
  // with its last acceptance (mock test council n14): after "changed meanwhile" or "already
  // accepted" the page would else keep showing the lines and the acceptance it was refused on.
  const accept = useMutation({
    mutationFn: async (expected: string) => {
      try {
        return await api.shipments.shipmentRemeasureAccept(shipmentId, { expected });
      } catch (e) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["warehouse-section", shipmentId] }),
          queryClient.invalidateQueries({ queryKey: ["shipments"] }),
        ]);
        if (e instanceof APIError && e.code === ErrCode.Aborted) throw new SectionChangedError(e.message);
        throw e;
      }
    },
    onSuccess: async (res) => {
      settle(res);
      // Only recorded (owner's answer 22 Nov): the shipment's cargo stays as it is. What reads the
      // acceptance is read again - under ["shipments"] the shipment and this acceptance (the tile,
      // Costs Breakdown, the Warehouse tab's bar), and the Alerts, whose remeasurement now reads
      // "Accepted by …".
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shipments"] }),
        queryClient.invalidateQueries({ queryKey: remeasureInformedKey(shipmentId) }),
      ]);
    },
  });

  // `acceptedAt`: the acceptance the warning shows (mock test S20-079). A newer one accepted meanwhile is
  // refused, and the acceptance is read again, so the warning shows the one still to check.
  const costsChecked = useMutation({
    mutationFn: (acceptedAt: string) => api.shipments.shipmentRemeasureCostsChecked(shipmentId, { acceptedAt }),
    onSuccess: settle,
    onError: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return {
    acceptance: query.data?.acceptance ?? null,
    isLoading: query.isLoading,
    accept: accept.mutateAsync,
    isAccepting: accept.isPending,
    markCostsChecked: costsChecked.mutateAsync,
    isMarking: costsChecked.isPending,
  };
}
