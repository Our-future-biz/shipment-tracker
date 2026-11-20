import { businessDateTime } from "@/lib/date";

// One request waits per invoice, a change on the issue day or a partial credit note (user council B5):
// the server refuses the second (API services/invoicing/lib/waitingRequest) and the dialogs say so before
// anything is typed, in the same words.

/** Why a request can't be asked while one of `kind` waits on the same invoice since `requestedAt`. */
export function waitingRequestReason(kind: "credit" | "change", requestedAt: string): string {
  const what = kind === "credit" ? "A partial credit note for this invoice" : "A change of this invoice";
  return `${what} is waiting for approval (asked ${businessDateTime(requestedAt)}): wait for it or take it back`;
}

/** The request waiting on an invoice, of a shipment's requests (newest first); null when none waits. */
export function waitingOn<R extends { invoiceId: string; status: string }>(requests: readonly R[] | undefined, invoiceId: string): R | null {
  return (requests ?? []).find((r) => r.invoiceId === invoiceId && r.status === "pending") ?? null;
}

/**
 * The change waiting on an invoice that stops a partial credit note being asked: only one of `today`'s issue day, as
 * the server refuses (API creditNoteRequest.service ask). A change of an earlier day has expired, even before the
 * nightly run marks it so, and blocks nothing.
 */
export function blockingChangeOn<R extends { invoiceId: string; status: string; issueDate: string }>(
  requests: readonly R[] | undefined,
  invoiceId: string,
  today: string,
): R | null {
  const change = waitingOn(requests, invoiceId);
  return change && change.issueDate === today ? change : null;
}
