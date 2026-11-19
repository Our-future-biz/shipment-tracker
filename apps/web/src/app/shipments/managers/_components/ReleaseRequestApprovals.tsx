"use client";

import { ApprovalsCard } from "@/components/cockpit/ApprovalsCard";
import { useReleaseRequestQueue } from "@/hooks/useReleaseRequests";
import { useAuth } from "@/lib/auth/AuthContext";
import { isOwnReleaseRequest, OWN_RELEASE_REQUEST, RELEASE_APPROVAL_HINT, RELEASE_WHAT_LABEL, releaseAnsweredNote, releaseRequestHref } from "@/lib/paymentWarnings";
import { canWithdrawApproval, releaseClosedNote } from "@/lib/releaseRequestQueue";
import { WithdrawReleaseRequest } from "@/components/finance/WithdrawReleaseRequest";
import { HINT } from "@/styles/ui";

// What waits for a manager's approval, third queue: requests to release a job the prepayment stop holds
// (Council Outlay 11, D16) - its House BoL, or the cargo from the warehouse. Approving releases nothing: it lets
// the job be released once within 7 days, and the release itself is made by the user, the usual way, recorded
// with the approving manager's name. Either answer needs a reason (up to 500 characters, the server's limit). A
// manager never answers a request of their own: in place of the two buttons it says so, in the server's words,
// and the request waits for another manager. The Answered list says what became of an
// approval - used, not used yet, run out - and lists the requests the app closed because the job was released
// another way, or that were withdrawn (by whoever asked, or a manager), each with the manager's own reason kept. An
// approval nobody used yet can be withdrawn there, with a reason (K20).

/** The queue's count for the Approvals tab's badge (_lib/approvalsBadge reads it as one of its queues): the requests still waiting. */
export function useReleaseRequestApprovals(): { waiting: number; isLoading: boolean; isError: boolean } {
  const { waiting, isLoading, isError } = useReleaseRequestQueue();
  return { waiting, isLoading, isError };
}

export function ReleaseRequestApprovals() {
  const releases = useReleaseRequestQueue();
  const { user } = useAuth();
  return (
    <ApprovalsCard
      title="Approvals · release before payment"
      hint={`A job on prepayment that is not paid is released only with a manager's approval. ${RELEASE_APPROVAL_HINT}, recorded with your name and both reasons. Approving and rejecting both need a reason. You cannot answer a request you made yourself. The answer goes to whoever asked.`}
      whatHeader="Release"
      shipmentHref={releaseRequestHref}
      approvals={releases}
      approveNeedsReason
      approveReasonLabel="Why may it be released before payment?"
      answeredNote={(r) => {
        // Closed: what became of it, the manager's own reason for an approval kept (m19) - the card shows no closed request's comment.
        const note = r.status === "closed" ? releaseClosedNote(r) : releaseAnsweredNote(r);
        if (!note && !canWithdrawApproval(r)) return null;
        return (
          <>
            {note}
            {/* K20: an approval nobody used can be taken back; it then lets nothing through. */}
            {canWithdrawApproval(r) && (
              <div className="mt-1">
                <WithdrawReleaseRequest request={r} kind="approval" />
              </div>
            )}
          </>
        );
      }}
      cannotDecide={(r) => (isOwnReleaseRequest(r, user?.id) ? OWN_RELEASE_REQUEST : null)}
      maxLength={500}
      what={(r) => (
        <>
          <div className="font-semibold text-slate-900">{RELEASE_WHAT_LABEL[r.what] ?? r.what}</div>
          {r.status === "pending" && <div className={HINT}>{RELEASE_APPROVAL_HINT}</div>}
        </>
      )}
    />
  );
}
