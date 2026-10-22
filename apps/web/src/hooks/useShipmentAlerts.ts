"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useShipmentAttachments, type AttachmentItem } from "@/hooks/useShipmentAttachments";

/** A shipment's alert: customs' latest verdict on one of its documents. */
export type ShipmentAlert = AttachmentItem & { customsReviewedAt: string };

export const alertReadKey = (shipmentId: string) => ["shipment-alerts-read", shipmentId] as const;

/**
 * The mark-read call: the badge goes at once, not after the server has answered, and the server's
 * own time is read back once the call took. A call that failed leaves the badge off instead: read
 * back then, the old time would show the alerts as new again and the open tab would mark them
 * read again at once - a loop of failing calls. They count as new again on the next visit.
 */
export const markReadOptions = (queryClient: QueryClient, shipmentId: string) => ({
  mutationFn: () => api.shipments.alertMarkRead(shipmentId),
  onMutate: () => {
    queryClient.setQueryData(alertReadKey(shipmentId), { readAt: new Date().toISOString() });
  },
  onSuccess: () => queryClient.invalidateQueries({ queryKey: alertReadKey(shipmentId) }),
});

/**
 * A shipment's Alerts, newest first, and how many of them are new to whoever is signed in: given
 * since they last opened the Alerts tab (every one, when they never did). `markRead` says they
 * have just seen them all.
 */
export const useShipmentAlerts = (shipmentId: string) => {
  const queryClient = useQueryClient();
  const { attachments, isLoading, isError } = useShipmentAttachments(shipmentId);
  const read = useQuery({
    queryKey: alertReadKey(shipmentId),
    queryFn: () => api.shipments.alertReadGet(shipmentId),
    enabled: !!shipmentId,
  });

  // A document carries customs' latest verdict and when it was given: one alert each.
  const alerts = useMemo(
    () =>
      attachments
        .filter((a): a is ShipmentAlert => !!a.customsStatus && !!a.customsReviewedAt)
        .sort((a, b) => b.customsReviewedAt.localeCompare(a.customsReviewedAt)),
    [attachments],
  );

  // Nothing is counted as new before it is known when the user last looked.
  const readAt = read.data?.readAt ?? null;
  const newCount = read.isSuccess ? alerts.filter((a) => !readAt || a.customsReviewedAt > readAt).length : 0;

  const mark = useMutation(markReadOptions(queryClient, shipmentId));
  const { mutate } = mark;
  const markRead = useCallback(() => mutate(), [mutate]);

  return { alerts, newCount, isLoading, isError, markRead };
};
