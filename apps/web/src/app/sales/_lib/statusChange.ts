import type { controllers } from "@/lib/api/client";
import type { SettableQuoteStatus } from "./types";

/** How far ahead the calendar starts when a quote going out has no validity. */
export const DEFAULT_VALIDITY_DAYS = 15;

/**
 * Whether sending asks for the date: when the quote has no validity date, or one that has passed
 * by the same calendar day the server goes by. A validity that still holds is kept as it is.
 */
export function asksValidity(validUntil: string | null, today: string): boolean {
  return validUntil === null || validUntil < today;
}

/** What the user chose when changing a quote's status. */
export interface StatusChange {
  status: SettableQuoteStatus;
  comment?: string;
  /** To Quoted: the date it is valid until. Chosen only when the quote has no validity that still holds. */
  validUntil?: string;
  /** To Lost: "Category: reason". */
  lostReason?: string;
}

// A change of status as the server is asked for it. The lifecycle bar on the quote page, the bulk
// "Set status" in the Quotes list and "Mark as sent" in the email dialog all ask with this, and the
// server does the rest - whether the move is allowed, who made it and when, the sent and decision
// dates, the validity and the history line - so a status change leaves the same trace wherever it
// is made. The rates a sent quote keeps are the server's to stamp (today's ČNB fixing and ROE %);
// the browser never sends them.
// `seen` is the status the screen showed when the user chose (the effective one, so "expired"
// for a quote whose validity has passed): the server then refuses the change once the quote is in
// another - a status change writes no document, so the document's version alone would let a page
// that still shows Quoted set a quote a colleague made Won meanwhile.
export function transitionRequest(change: StatusChange, seen?: string): controllers.SalesQuoteTransitionRequest {
  const { status } = change;
  return {
    to: status,
    comment: change.comment?.trim() || undefined,
    validUntil: status === "quoted" ? change.validUntil : undefined,
    lostReason: status === "lost" ? change.lostReason : undefined,
    ...(seen ? { expectedStatus: seen } : {}),
  };
}

/**
 * How a quote set to Quoted by hand reached the customer. Quoted means the customer has it, yet
 * the app sends nothing itself (E-mail and Export PDF hand it to the mail program or the printer),
 * so a Draft could be made Quoted with nothing sent and nothing said (User Council S21). The
 * status-change dialog asks; the answer goes into the history with the comment. Not answering is
 * no stop: the dialog then says what Quoted means.
 */
export const SENT_BY_OPTIONS = ["E-mail from my mail program", "PDF handed over", "Phone", "In person", "Other"] as const;

/** The comment a status change goes with, with how the quote was sent in front of it. */
export function withSentBy(comment: string, sentBy: string | null | undefined): string {
  const how = sentBy?.trim();
  return [how && `How it was sent: ${how}.`, comment.trim()].filter(Boolean).join(" ");
}
