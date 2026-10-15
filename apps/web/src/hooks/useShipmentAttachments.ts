"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";

export type AttachmentItem = interfaces.AttachmentItem;

/** One cache entry per shipment for its documents, shared by every panel and tab that lists them. */
export const shipmentAttachmentsKey = (shipmentId: string) => ["shipment-attachments", shipmentId];

export const useShipmentAttachments = (shipmentId: string) => {
  const queryClient = useQueryClient();
  const key = shipmentAttachmentsKey(shipmentId);

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.shipments.attachmentList(shipmentId),
    enabled: !!shipmentId,
  });

  // A document added, removed or reviewed also changes the shipment row: its customs status
  // and the "received" ticks follow the paperwork.
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["shipments"] });
    return queryClient.invalidateQueries({ queryKey: shipmentAttachmentsKey(shipmentId) });
  }, [queryClient, shipmentId]);

  // Memoised so an empty list is the same array between renders (it feeds other memos).
  const attachments = useMemo(() => query.data?.attachments ?? [], [query.data]);

  return { ...query, attachments, refresh, key };
};
