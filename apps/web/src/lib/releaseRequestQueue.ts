import { shortDateTime } from "@/lib/paymentWarnings";

// The requests to release before payment (Council Outlay 11, D16) as the managers' queue and the asker see them,
// beyond what lib/paymentWarnings words: what waits for whom (K21), what became of a closed one (m19), and who may
// withdraw what (K20). The server decides each again (apps/api shipments lib/releaseRequest withdrawOf).

/** The requests still waiting that this viewer can answer: not their own. Without a viewer, every one waiting. */
export function releaseRequestsWaitingFor(requests: readonly { status: string; requestedById: string }[] | undefined, viewerId: string | null | undefined): number {
  // A request they asked for themself waits for another manager - four eyes, they cannot answer it - so it is no
  // work of theirs, and their own bell does not count it (K21); every other manager's bell does.
  const me = (viewerId ?? "").trim().toLowerCase();
  return (requests ?? []).filter((r) => r.status === "pending" && (!me || r.requestedById.trim().toLowerCase() !== me)).length;
}

/** A request as these rules read it (the server's ReleaseRequestItem). */
export interface ClosableRequest {
  status: string;
  requestedById: string;
  usedAt: string | null;
  decidedAt: string | null;
  comment: string;
  closedAt: string | null;
  /** "released" (released another way) or "withdrawn"; null while not closed. An older answer has none. */
  closedWhy?: string | null;
  closedByName?: string;
  closeReason?: string;
}

/** The longest reason a withdrawal takes (the server's limit), and the shortest. */
export const MAX_WITHDRAW_REASON = 500;
export const MIN_WITHDRAW_REASON = 3;

/** Whether a manager may withdraw this approval: approved and not used yet (also one that ran out). */
export const canWithdrawApproval = (r: Pick<ClosableRequest, "status" | "usedAt">): boolean => r.status === "approved" && !r.usedAt;

/** Whether the viewer may withdraw this request as whoever asked: theirs, and still waiting. */
export const canWithdrawOwnRequest = (r: Pick<ClosableRequest, "status" | "requestedById">, viewerId: string | null | undefined): boolean =>
  r.status === "pending" && !!viewerId && r.requestedById.trim().toLowerCase() === viewerId.trim().toLowerCase();

/**
 * What the Answered list says of a closed request (m19): withdrawn - by whom, when and why -, or closed because the
 * job was released without it; and of one that had been approved, the manager's own reason, kept (the list does not
 * show a closed request's comment itself). Null for one that is not closed.
 */
export function releaseClosedNote(r: ClosableRequest): string | null {
  if (r.status !== "closed") return null;
  const approved = r.decidedAt && r.comment.trim() ? `Approved: ${r.comment.trim()}. ` : "";
  if (r.closedWhy === "withdrawn") {
    const who = [r.closedByName?.trim() || "", shortDateTime(r.closedAt)].filter(Boolean).join(" ");
    const why = r.closeReason?.trim() ? `: ${r.closeReason.trim()}` : "";
    return `${approved}${r.decidedAt ? "Approval withdrawn" : "Withdrawn"}${who ? ` by ${who}` : ""}${why}`;
  }
  return `${approved}Closed: released without it`;
}
