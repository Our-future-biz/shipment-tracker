"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { RELEASE_REQUESTS_KEY } from "@/hooks/useReleaseRequests";
import type { ApprovalQueueCount } from "@/lib/operationsApprovals";

// The bell's count for managers: what waits in the three queues of Shipments → Managers → Approvals. The same
// three answers the Approvals tab reads, under the same keys (useCustomsOfficeApprovals, useDocumentChangeApprovals,
// useReleaseRequestQueue), so the bell and the tab never show two different counts - and a decision made on the
// tab is in the bell at once. Asked only for a manager: the first two lists are refused to anyone else.

const pending = (requests: readonly { status: string }[] | undefined) => (requests ?? []).filter((r) => r.status === "pending").length;

const EVERY_MINUTE = 60_000;

/**
 * The three queues as they were read (documents, Customs Office, release requests). `allRead`: each of them has
 * been read at least once - only then is "more wait than a moment ago" a comparison of like with like (a queue
 * that failed and loads later brings its backlog, which is not news).
 */
export const useOperationsApprovalsWaiting = (enabled: boolean): { queues: ApprovalQueueCount[]; allRead: boolean } => {
  const documents = useQuery({
    queryKey: ["document-change-requests"],
    queryFn: async () => (await api.shipments.documentChangeRequestList()).requests,
    enabled,
    refetchInterval: EVERY_MINUTE,
  });
  const offices = useQuery({
    queryKey: ["customs-office-requests"],
    queryFn: async () => (await api.shipments.customsOfficeRequestList()).requests,
    enabled,
    refetchInterval: EVERY_MINUTE,
  });
  const releases = useQuery({
    queryKey: RELEASE_REQUESTS_KEY,
    queryFn: async () => (await api.shipments.releaseRequestList()).requests,
    enabled,
    refetchInterval: EVERY_MINUTE,
  });
  if (!enabled) return { queues: [], allRead: false };
  const all = [documents, offices, releases];
  return {
    // A failed read must not read as "nothing waits": the line then says "at least".
    queues: all.map((q) => ({ waiting: pending(q.data), isError: q.isError && !q.data })),
    allRead: all.every((q) => q.data !== undefined),
  };
};
