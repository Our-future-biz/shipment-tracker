"use client";

import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useUsers } from "@/hooks/useUsers";
import type { ShipmentItem } from "@/hooks/useShipments";
import { remeasureNotice, type CargoFigures } from "@/app/shipments/_lib/remeasureNotice";

/**
 * Posts "Cargo has been remeasured" to a shipment's chat, tagging its Person in Charge and Holiday
 * Cover: their notifications show it and the shipment's chat counts it unread for them - also for
 * the one clicking, when they are one of the two. Resolves to how many were tagged.
 */
export function useRemeasureNotice() {
  const queryClient = useQueryClient();
  const { users } = useUsers();
  return async (shipment: ShipmentItem, shipmentFigures: CargoFigures, remeasured: CargoFigures): Promise<number> => {
    const { message, mentionedUserIds } = remeasureNotice(shipment, users, shipmentFigures, remeasured);
    await api.shipments.commentCreate(shipment.id, { message, attachmentIds: [], mentionedUserIds });
    // The chat, the bell's mentions and the grid's unread marks.
    queryClient.invalidateQueries({ queryKey: ["comments", shipment.id] });
    queryClient.invalidateQueries({ queryKey: ["shipment-comments"] });
    return mentionedUserIds.length;
  };
}
