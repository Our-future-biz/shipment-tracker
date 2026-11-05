"use client";

import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { useUsers } from "@/hooks/useUsers";
import type { ShipmentItem } from "@/hooks/useShipments";
import { remeasureNotice, type CargoFigures } from "@/app/shipments/_lib/remeasureNotice";

/**
 * Posts "Cargo has been remeasured" to a shipment's chat, tagging its Person in Charge and Holiday
 * Cover (their notifications show it). The one posting is not notified of their own message, as in
 * the chat. Resolves to how many others were tagged.
 */
export function useRemeasureNotice() {
  const queryClient = useQueryClient();
  const { users } = useUsers();
  const { user } = useAuth();
  return async (shipment: ShipmentItem, shipmentFigures: CargoFigures, remeasured: CargoFigures): Promise<number> => {
    const { message, mentionedUserIds } = remeasureNotice(shipment, users, shipmentFigures, remeasured);
    await api.shipments.commentCreate(shipment.id, { message, attachmentIds: [], mentionedUserIds });
    queryClient.invalidateQueries({ queryKey: ["comments", shipment.id] });
    queryClient.invalidateQueries({ queryKey: ["shipment-comments"] });
    return mentionedUserIds.filter((id) => id !== user?.id).length;
  };
}
