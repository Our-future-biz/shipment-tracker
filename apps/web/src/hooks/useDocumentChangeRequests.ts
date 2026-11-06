"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { fileToBase64 } from "@/lib/files";
import { shipmentAttachmentsKey } from "@/hooks/useShipmentAttachments";

export type DocumentChangeRequestItem = interfaces.DocumentChangeRequestItem;

// Replacing a document customs has approved: a regular user asks in the Customs module with the new
// file, a manager answers in the Warehouse Managers page's Approvals tab, and the answer reaches the
// one who asked under the bell.

const keys = {
  list: ["document-change-requests"] as const,
  answers: ["document-change-request-answers"] as const,
  shipment: (shipmentId: string) => ["document-change-requests", shipmentId] as const,
};

/** The Customs module's documents: each one's newest request, and asking for a change. */
export const useDocumentChangeRequests = (shipmentId: string, enabled: boolean) => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: keys.shipment(shipmentId),
    queryFn: async () => (await api.shipments.documentChangeRequestsOfShipment(shipmentId)).requests,
    enabled: enabled && !!shipmentId,
  });
  const newestOf = useMemo(() => {
    const map = new Map<string, DocumentChangeRequestItem>();
    // Newest first from the server: the first of a document is its newest.
    for (const r of query.data ?? []) if (!map.has(r.attachmentId)) map.set(r.attachmentId, r);
    return map;
  }, [query.data]);
  const ask = useMutation({
    mutationFn: async ({ attachmentId, file, reason }: { attachmentId: string; file: File; reason: string }) =>
      api.shipments.documentChangeRequestAsk(shipmentId, attachmentId, {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || "application/octet-stream",
        contentBase64: await fileToBase64(file),
        reason,
      }),
    // keys.list is the start of the shipment's key too, so this also refreshes the documents' rows.
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.list }),
  });
  return { newestOf, ask };
};

/** The Approvals tab: what waits, and what was answered in the last 30 days (managers only). */
export const useDocumentChangeApprovals = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: keys.list,
    queryFn: async () => (await api.shipments.documentChangeRequestList()).requests,
    refetchInterval: 60_000,
  });
  const decide = useMutation({
    mutationFn: ({ id, approve, comment }: { id: string; shipmentId: string; approve: boolean; comment: string }) =>
      api.shipments.documentChangeRequestDecide(id, { approve, comment }),
    onSettled: (_data, _err, { shipmentId }) => {
      queryClient.invalidateQueries({ queryKey: keys.list });
      // An approved request changes the shipment's documents, and its customs status with them.
      queryClient.invalidateQueries({ queryKey: shipmentAttachmentsKey(shipmentId) });
      queryClient.invalidateQueries({ queryKey: ["shipments"] });
    },
  });
  const requests = query.data ?? [];
  return {
    requests,
    waiting: requests.filter((r) => r.status === "pending").length,
    isLoading: query.isLoading,
    // A failed load must not read as "nothing to answer".
    isError: query.isError && !query.data,
    decide,
  };
};

/** The bell: the answers to the signed-in user's own requests. */
export const useDocumentChangeAnswers = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: keys.answers,
    queryFn: async () => (await api.shipments.documentChangeRequestAnswers()).answers,
    refetchInterval: 30_000,
  });
  const seen = useMutation({
    mutationFn: (id: string) => api.shipments.documentChangeRequestSeen(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.answers }),
  });
  return { answers: query.data ?? [], hasLoaded: query.data !== undefined, seen };
};
