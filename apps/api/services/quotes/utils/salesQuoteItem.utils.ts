import { businessDay } from "../../../lib/businessDate";
import { canApproveMargin, ownerChangeRight, quoteDeletePermission } from "../../../lib/salesPolicy";
import { roadMargin, type MarginContext } from "../lib/roadMargin";
import type { RoadMargin, SalesQuoteItem } from "../interfaces/interfaces";
import type { SalesQuoteRecord } from "../schemas/quote.schema";
import { isPlainObject } from "./quoteDocument.utils";
import { allowedTransitions, effectiveStatus, isFollowUpDue, lastContact, stateOf, wasEverSent } from "./quoteLifecycle.utils";

const iso = (at: Date | null) => at?.toISOString() ?? null;

// The road margin with the manager who approved it shown by e-mail as the users have it now (an
// older approval recorded a display name); somebody no longer among the users keeps what was recorded.
function shownMargin(margin: RoadMargin | null, userEmails: Map<string, string>): RoadMargin | null {
  if (!margin?.approval) return margin;
  const byName = userEmails.get(margin.approval.byUserId) || margin.approval.byName;
  return { ...margin, approval: { ...margin.approval, byName } };
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
  const everSent = wasEverSent(state, isPlainObject(row.data) ? row.data.timeline : undefined);
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
    effectiveStatus: effectiveStatus(state.status, state.validUntil, today),
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
    roadMargin: margins ? shownMargin(roadMargin(row.data, margins), userEmails) : null,
    permissions: {
      canChangeOwner: ownerChangeRight(actor, state),
      canDelete: deletion.allowed,
      ...(deletion.allowed ? {} : { deleteBlockedReason: deletion.reason }),
      canApproveMargin: canApproveMargin(actor.role),
    },
  };
}
