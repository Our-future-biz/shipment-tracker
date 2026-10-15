"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { controllers, interfaces } from "@/lib/api/client";
import type { SupplierKind } from "../../settings/_lib/useWarehouseSettings";

// Supplier e-mail of a position (Send VGM / survey / remeasurement): the preview, the send and the
// latest attempts (for "Last e-mail failed — Retry"). Kept next to the Sent-to-suppliers block; the
// integrator may move it to src/hooks/useWarehouseSection.ts.

export type SupplierEmail = interfaces.SupplierEmailItem;
export type SupplierEmailPreview = interfaces.SupplierEmailPreview;

const attemptsKey = (taskId: string) => ["warehouse-supplier-emails", taskId];

export function useSupplierEmails(taskId: string | null | undefined) {
  const query = useQuery({
    queryKey: attemptsKey(taskId ?? ""),
    queryFn: () => api.warehouse.warehousePositionSupplierEmails(taskId!),
    enabled: !!taskId,
  });
  return { emails: query.data?.emails ?? [], isLoading: query.isLoading };
}

export function useSupplierEmailPreview(taskId: string | null | undefined, what: SupplierKind | null) {
  return useQuery({
    queryKey: ["warehouse-supplier-email-preview", taskId ?? "", what ?? ""],
    queryFn: async () => (await api.warehouse.warehousePositionSendToSupplier(taskId!, { what: what!, previewOnly: true })).preview,
    enabled: !!taskId && !!what,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

// The send. Only an e-mail the provider took is marked as sent (the saved section comes back); a
// failure leaves it "not sent" — the attempts and the History show why.
export function useSendToSupplier(taskId: string | null | undefined) {
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: attemptsKey(taskId ?? "") });
    queryClient.invalidateQueries({ queryKey: ["warehouse-section"], predicate: (q) => q.queryKey[1] !== "task" || q.queryKey[2] !== taskId });
    queryClient.invalidateQueries({ queryKey: ["warehouse-section-summary"] });
    queryClient.invalidateQueries({ queryKey: ["warehouse-gate"] });
  };
  return useMutation({
    mutationFn: ({ what, note, clientRequestId }: { what: SupplierKind; note: string; clientRequestId: string }) =>
      api.warehouse.warehousePositionSendToSupplier(taskId!, { what, note, clientRequestId }),
    onSuccess: (res) => {
      if (res.section) {
        queryClient.setQueryData<controllers.WarehouseSectionGetResponse>(["warehouse-section", "task", taskId ?? "", "job"], { section: res.section });
      }
      refresh();
    },
    onError: refresh,
  });
}

/**
 * The latest attempt of `what` when it did not end as a recorded send: failed, never finished, or
 * e-mailed but not marked as sent (status "sent" with an error — see sentNotRecorded).
 */
export function lastFailedAttempt(emails: SupplierEmail[], what: SupplierKind): SupplierEmail | null {
  const latest = emails.find((e) => e.kind === what);
  return latest && (latest.status === "failed" || latest.status === "unknown" || sentNotRecorded(latest)) ? latest : null;
}

/** The e-mail went out but marking it as sent failed: record it with "Mark as sent", do not resend. */
export const sentNotRecorded = (e: SupplierEmail | null | undefined) => !!e && e.status === "sent" && !!e.error;

/** The outcome is not known (no answer in time, or never finished): it may have gone out. */
export const mayHaveGoneOut = (e: SupplierEmail | null | undefined) =>
  !!e && (e.status === "unknown" || (e.status === "failed" && /may still have gone out/i.test(e.error)));
