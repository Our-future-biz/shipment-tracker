"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { shipmentDetailKey } from "@/hooks/useShipment";
import { shipmentAttachmentsKey } from "@/hooks/useShipmentAttachments";
import type { interfaces } from "@/lib/api/client";

const key = (shipmentId: string) => ["import-instructions", shipmentId] as const;
const WAITING_KEY = ["import-instructions-waiting"] as const;

/** A shipment's Import Instructions, in Shipments → Warehouse. */
export const useImportInstructions = (shipmentId: string, { enabled = true }: { enabled?: boolean } = {}) => {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: key(shipmentId), queryFn: () => api.shipments.importInstructionsGet(shipmentId), enabled, refetchInterval: 60_000 });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key(shipmentId) });
    void queryClient.invalidateQueries({ queryKey: WAITING_KEY });
  };
  // Approving fills the shipment's empty fields and files a document.
  const refreshShipment = () => {
    refresh();
    void queryClient.invalidateQueries({ queryKey: shipmentDetailKey(shipmentId) });
    void queryClient.invalidateQueries({ queryKey: shipmentAttachmentsKey(shipmentId) });
  };
  const createLink = useMutation({ mutationFn: () => api.shipments.importInstructionsCreateLink(shipmentId), onSettled: refresh });
  const cancelLink = useMutation({ mutationFn: () => api.shipments.importInstructionsCancelLink(shipmentId), onSettled: refresh });
  const approve = useMutation({ mutationFn: (answers: interfaces.ImportInstructionAnswers) => api.shipments.importInstructionsApprove(shipmentId, { answers }), onSettled: refreshShipment });
  const reject = useMutation({ mutationFn: (reason: string) => api.shipments.importInstructionsReject(shipmentId, { reason }), onSettled: refresh });
  return { state: query.data?.state ?? null, askable: query.data?.askable ?? false, canAsk: query.data?.canAsk ?? false, isLoading: query.isLoading, createLink, cancelLink, approve, reject };
};

/** The completed forms waiting for the user: the bell. */
export const useImportInstructionsWaiting = () => {
  const query = useQuery({ queryKey: WAITING_KEY, queryFn: async () => (await api.shipments.importInstructionsWaiting()).waiting, refetchInterval: 60_000 });
  return { waiting: query.data ?? [] };
};
