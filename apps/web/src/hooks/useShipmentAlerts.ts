"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { useShipmentAttachments, type AttachmentItem } from "@/hooks/useShipmentAttachments";

/** A shipment's alert: a document customs declined, as its latest verdict. */
export type ShipmentAlert = AttachmentItem & { customsReviewedAt: string };

/** The documents that need attention, newest first: an approved one is no alert. */
export const shipmentAlerts = (attachments: readonly AttachmentItem[]): ShipmentAlert[] =>
  attachments
    .filter((a): a is ShipmentAlert => a.customsStatus === "declined" && !!a.customsReviewedAt)
    .sort((a, b) => b.customsReviewedAt.localeCompare(a.customsReviewedAt));

export const alertReadKey = (shipmentId: string) => ["shipment-alerts-read", shipmentId] as const;

/** Customs' verdict as the bell of the shipment's people shows it. */
export type CustomsVerdictNotice = interfaces.CustomsVerdictNotice;

const CUSTOMS_VERDICTS_KEY = ["customs-verdict-notices"] as const;

/**
 * The bell: customs' verdicts on the shipments this user is the Person in Charge or Holiday Cover
 * of. Opening one marks the shipment's Alerts read, the same moment the tab's count goes.
 */
export const useCustomsVerdictNotices = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: CUSTOMS_VERDICTS_KEY,
    queryFn: async () => (await api.shipments.customsVerdictNotices()).verdicts,
    refetchInterval: 30_000,
  });
  const seen = useMutation({
    mutationFn: (shipmentId: string) => api.shipments.alertMarkRead(shipmentId),
    onSuccess: (_data, shipmentId) => queryClient.invalidateQueries({ queryKey: alertReadKey(shipmentId) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CUSTOMS_VERDICTS_KEY }),
  });
  return { verdicts: query.data ?? [], hasLoaded: query.data !== undefined, seen };
};

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
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: alertReadKey(shipmentId) });
    // The tab was opened: its verdicts are no longer new under the bell either.
    queryClient.invalidateQueries({ queryKey: CUSTOMS_VERDICTS_KEY });
  },
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

  const alerts = useMemo(() => shipmentAlerts(attachments), [attachments]);

  // Nothing is counted as new before it is known when the user last looked.
  const readAt = read.data?.readAt ?? null;
  const newCount = read.isSuccess ? alerts.filter((a) => !readAt || a.customsReviewedAt > readAt).length : 0;

  const mark = useMutation(markReadOptions(queryClient, shipmentId));
  const { mutate } = mark;
  const markRead = useCallback(() => mutate(), [mutate]);

  return { alerts, newCount, isLoading, isError, markRead };
};
