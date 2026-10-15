import { businessDay } from "../../../lib/businessDate";
import { canApproveMargin, ownerChangeRight, quoteDeletePermission } from "../../../lib/salesPolicy";
import { roadMargin, type MarginContext } from "../lib/roadMargin";
import type { SalesQuoteItem } from "../interfaces/interfaces";
import type { SalesQuoteRecord } from "../schemas/quote.schema";
import { isPlainObject } from "./quoteDocument.utils";
import { allowedTransitions, effectiveStatus, isFollowUpDue, lastContact, stateOf, wasEverSent } from "./quoteLifecycle.utils";

const iso = (at: Date | null) => at?.toISOString() ?? null;

/**
 * THE ONE MAPPER from a stored sales quote to what the API hands out. Everything that depends on
 * the moment or on who asks is worked out here, from the rules: whether the quote counts as
 * expired, what it may be set to, whether a follow-up is due, its road margin, and what this user
 * may do with it. `userNames` are the display names of the company's users by id; `margins` is
 * what a road margin is judged with - left out when the rule applies to none of the quotes read.
 */
export function toItem(
  row: SalesQuoteRecord,
  userNames: Map<string, string>,
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
    // A renamed user shows under the new name at once; a label nobody is linked to shows as it is.
    ownerName: (state.ownerUserId && userNames.get(state.ownerUserId)) || state.ownerLabel,
    ownerLabel: state.ownerLabel,
    shipmentId: state.shipmentId,
    shipmentJobNumber: state.shipmentJobNumber,
    roadMargin: margins ? roadMargin(row.data, margins) : null,
    permissions: {
      canChangeOwner: ownerChangeRight(actor, state),
      canDelete: deletion.allowed,
      ...(deletion.allowed ? {} : { deleteBlockedReason: deletion.reason }),
      canApproveMargin: canApproveMargin(actor.role),
    },
  };
}
