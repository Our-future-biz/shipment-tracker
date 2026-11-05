import { businessDay } from "../../../lib/businessDate";
import { canApproveMargin, ownerChangeRight, quoteDeletePermission, type OwnerChangeRight } from "../../../lib/salesPolicy";
import { freightModeGateMessage, marginGateMessage, roadMargin, type MarginContext } from "../lib/roadMargin";
import { inquiryGateMessage } from "./warehouseInquiry.utils";
import { shippingTermsGateMessage } from "./shippingTerms.utils";
import type { RoadMargin, SalesQuoteItem } from "../interfaces/interfaces";
import type { SalesQuoteRecord } from "../schemas/quote.schema";
import { isPlainObject, isWonRevision } from "./quoteDocument.utils";
import { PRICING_CLOSED, allowedTransitions, effectiveStatus, isFollowUpDue, keepsGivenTerms, lastContact, stateOf, wasEverSent, type LifecycleState } from "./quoteLifecycle.utils";

const iso = (at: Date | null) => at?.toISOString() ?? null;

/**
 * Why the quote cannot go out now - or be Won without going out - or null. Only a quote whose
 * prices are open is held (a draft, ready to send, a revision, a Won quote's revision): one that
 * went out passed the gates when it was sent, and is not held again (Council Outlay 6).
 */
function sendBlockedOf(row: SalesQuoteRecord, shown: string, margin: RoadMargin | null): string | null {
  if (PRICING_CLOSED.includes(shown) && !isWonRevision(row.status, row.data)) return null;
  const mode = freightModeGateMessage(row.data);
  if (mode) return mode;
  const terms = shippingTermsGateMessage(row.data);
  if (terms) return terms;
  return margin?.needsApproval ? marginGateMessage(margin) : inquiryGateMessage(row.data, "ready_to_send");
}

// The road margin with the manager who approved it shown by e-mail as the users have it now (an
// older approval recorded a display name); somebody no longer among the users keeps what was recorded.
function shownMargin(margin: RoadMargin | null, userEmails: Map<string, string>): RoadMargin | null {
  if (!margin?.approval) return margin;
  const byName = userEmails.get(margin.approval.byUserId) || margin.approval.byName;
  return { ...margin, approval: { ...margin.approval, byName } };
}

// How far the user may change the owner, and why not when they may not. A closed quote keeps its
// owner whoever asks (applyOwner refuses another); otherwise it is the user's right (salesPolicy).
function ownerPermission(
  actor: { userID: string; role: string },
  state: LifecycleState,
  data: unknown,
): { canChangeOwner: OwnerChangeRight; ownerChangeBlockedReason?: string } {
  if (keepsGivenTerms(state.status, isWonRevision(state.status, data))) {
    return { canChangeOwner: "none", ownerChangeBlockedReason: "A closed quote keeps its owner - revise it" };
  }
  const right = ownerChangeRight(actor, state);
  return right === "none" ? { canChangeOwner: right, ownerChangeBlockedReason: "Only a manager can reassign this quote" } : { canChangeOwner: right };
}

/**
 * THE ONE MAPPER from a stored sales quote to what the API hands out. Everything that depends on
 * the moment or on who asks is worked out here, from the rules: whether the quote counts as
 * expired, what it may be set to, whether a follow-up is due, its road margin, and what this user
 * may do with it. `userEmails` are the e-mails of the company's users by id - a person is shown
 * by e-mail; `margins` is what a road margin is judged with - left out when the rule applies to
 * none of the quotes read.
 */
export function toItem(
  row: SalesQuoteRecord,
  userEmails: Map<string, string>,
  actor: { userID: string; role: string },
  now: Date,
  margins?: MarginContext,
): SalesQuoteItem {
  const state = stateOf(row);
  const today = businessDay(now);
  const margin = margins ? roadMargin(row.data, margins) : null;
  const everSent = wasEverSent(state, isPlainObject(row.data) ? row.data.timeline : undefined);
  const shown = effectiveStatus(state.status, state.validUntil, today);
  const deletion = quoteDeletePermission(actor, { ...state, everSent });
  return {
    id: row.id,
    quoteNumber: row.quoteNumber,
    data: row.data,
    terms: row.terms,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    dataVersion: row.dataVersion,
    status: state.status,
    effectiveStatus: shown,
    allowedTransitions: allowedTransitions(state, today),
    substatus: state.substatus,
    lostReason: state.lostReason,
    lostComment: state.lostComment,
    customerId: row.customerId,
    sentAt: iso(state.sentAt),
    firstSentAt: iso(state.firstSentAt),
    decidedAt: iso(state.decidedAt),
    validUntil: state.validUntil,
    lastContactAt: iso(lastContact(state)),
    followUpDue: isFollowUpDue(state, now, today),
    ownerUserId: state.ownerUserId,
    // The owner user's e-mail as the users have it now; a label nobody is linked to shows as it is.
    ownerName: (state.ownerUserId && userEmails.get(state.ownerUserId)) || state.ownerLabel,
    ownerLabel: state.ownerLabel,
    shipmentId: state.shipmentId,
    shipmentJobNumber: state.shipmentJobNumber,
    roadMargin: margin ? shownMargin(margin, userEmails) : null,
    sendBlocked: sendBlockedOf(row, shown, margin),
    permissions: {
      ...ownerPermission(actor, state, row.data),
      canDelete: deletion.allowed,
      ...(deletion.allowed ? {} : { deleteBlockedReason: deletion.reason }),
      canApproveMargin: canApproveMargin(actor.role),
    },
  };
}
