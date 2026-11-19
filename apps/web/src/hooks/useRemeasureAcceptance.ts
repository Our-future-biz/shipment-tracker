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

  // `expected`: the warehouse's remeasured lines as the page shows them. Changed meanwhile, the
  // warehouse's lines are read again so the new ones show, and nothing is accepted.
  const accept = useMutation({
    mutationFn: async (expected: string) => {
      try {
        return await api.shipments.shipmentRemeasureAccept(shipmentId, { expected });
      } catch (e) {
        if (e instanceof APIError && e.code === ErrCode.Aborted) {
          await queryClient.invalidateQueries({ queryKey: ["warehouse-section", shipmentId] });
          throw new SectionChangedError(e.message);
        }
        throw e;
      }
    },
    onSuccess: async (res) => {
      settle(res);
      // The cargo lines and totals changed: the shipment, the grids and W/M follow - and the
      // Alerts, whose remeasurement now reads "Accepted by …".
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shipments"] }),
        queryClient.invalidateQueries({ queryKey: remeasureInformedKey(shipmentId) }),
      ]);
    },
  });

  const costsChecked = useMutation({
    mutationFn: () => api.shipments.shipmentRemeasureCostsChecked(shipmentId),
    onSuccess: settle,
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
