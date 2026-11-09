"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import type { PreviewSource } from "@/hooks/useFilePreview";

export type AttachmentItem = interfaces.AttachmentItem;

/** One cache entry per shipment for its documents, shared by every panel and tab that lists them. */
export const shipmentAttachmentsKey = (shipmentId: string) => ["shipment-attachments", shipmentId];

/** The files' links last an hour, so the list is read again every half hour (and on coming back to the page). */
const LINK_REFRESH_MS = 30 * 60 * 1000;

export const useShipmentAttachments = (shipmentId: string) => {
  const queryClient = useQueryClient();
  const key = shipmentAttachmentsKey(shipmentId);

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.shipments.attachmentList(shipmentId),
    enabled: !!shipmentId,
    refetchInterval: LINK_REFRESH_MS,
    refetchOnWindowFocus: true,
  });

  // A document added, removed or reviewed also changes the shipment row: its customs status
  // and the "received" ticks follow the paperwork.
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["shipments"] });
    return queryClient.invalidateQueries({ queryKey: shipmentAttachmentsKey(shipmentId) });
  }, [queryClient, shipmentId]);

  // A fresh link to one file, for a preview or a download whose link has expired: the list is read
  // again, every link in it with it. Null when the file is no longer there.
  const freshUrl = useCallback(
    async (attachmentId: string) => {
      const data = await queryClient.fetchQuery({
        queryKey: shipmentAttachmentsKey(shipmentId),
        queryFn: () => api.shipments.attachmentList(shipmentId),
        staleTime: 0,
      });
      return data.attachments.find((a) => a.id === attachmentId)?.contentUrl ?? null;
    },
    [queryClient, shipmentId],
  );

  // A file of the list as the app's preview opens it (useFilePreview): an expired link is renewed.
  const previewSource = useCallback(
    (file: AttachmentItem) =>
      ({
        fileName: file.fileName,
        contentUrl: file.contentUrl,
        fileType: file.fileType,
        refreshUrl: () => freshUrl(file.id),
      }) satisfies PreviewSource,
    [freshUrl],
  );

  // Memoised so an empty list is the same array between renders (it feeds other memos).
  const attachments = useMemo(() => query.data?.attachments ?? [], [query.data]);

  return { ...query, attachments, refresh, key, freshUrl, previewSource };
};
