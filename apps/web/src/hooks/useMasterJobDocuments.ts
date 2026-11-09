"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import type { PreviewSource } from "@/hooks/useFilePreview";

export type MasterJobDocumentItem = interfaces.MasterJobDocumentItem;

/**
 * A master job's documents. A key of its own, outside ["master-jobs"]: a save of the master job does
 * not read them again, and they are apart from the shipments' documents (no house sees them).
 */
export const masterJobDocumentsKey = (masterJobId: string) => ["master-job-documents", masterJobId];

/** The files' links last an hour, so the list is read again every half hour (and on coming back to the page). */
const LINK_REFRESH_MS = 30 * 60 * 1000;

export const useMasterJobDocuments = (masterJobId: string) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: masterJobDocumentsKey(masterJobId),
    queryFn: () => api.shipments.masterJobDocumentList(masterJobId),
    enabled: !!masterJobId,
    refetchInterval: LINK_REFRESH_MS,
    refetchOnWindowFocus: true,
  });

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: masterJobDocumentsKey(masterJobId) }),
    [queryClient, masterJobId],
  );

  // A fresh link to one file, for a preview or a download whose link has expired: the list is read
  // again, every link in it with it. Null when the file is no longer there.
  const freshUrl = useCallback(
    async (documentId: string) => {
      const data = await queryClient.fetchQuery({
        queryKey: masterJobDocumentsKey(masterJobId),
        queryFn: () => api.shipments.masterJobDocumentList(masterJobId),
        staleTime: 0,
      });
      return data.documents.find((d) => d.id === documentId)?.contentUrl ?? null;
    },
    [queryClient, masterJobId],
  );

  // A file of the list as the app's preview opens it (useFilePreview): an expired link is renewed.
  const previewSource = useCallback(
    (file: MasterJobDocumentItem) =>
      ({
        fileName: file.fileName,
        contentUrl: file.contentUrl,
        fileType: file.fileType,
        refreshUrl: () => freshUrl(file.id),
      }) satisfies PreviewSource,
    [freshUrl],
  );

  // Memoised so an empty list is the same array between renders (it feeds other memos).
  const documents = useMemo(() => query.data?.documents ?? [], [query.data]);

  return { ...query, documents, refresh, freshUrl, previewSource };
};
