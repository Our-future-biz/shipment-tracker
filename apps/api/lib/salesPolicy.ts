// Who may do what in Sales. THE ONE PLACE with role logic for it: the API asks these functions,
// and the screens only ever see their answers as flags on what they load. Pure, so the whole
// policy is covered by a unit test - and changing it means changing this file.

import type { Role } from "./rbac";
import { quoteStatusLabel } from "./quoteStatusLabel";

/**
 * Roles that manage Sales: they may reassign and delete any quote and change the settings all of
 * Sales shares. A user of any other role is a plain user.
 */
export const SALES_MANAGE_ROLES: readonly Role[] = ["superadmin", "admin", "manager"];

/** `role` as the login carries it: a Role, or a text this code does not know (never a manager). */
export function canManageSales(role: string): boolean {
  return (SALES_MANAGE_ROLES as readonly string[]).includes(role);
}

/**
 * Why no shipment may be linked to a quote in this status - the one it is shown with, so an
 * expired quote is refused as Expired - finishing the sentence "QCZ… - …"; null when one may.
 * Only a Won quote's number is given to a shipment as its Sales Reference; a shipment created
 * from a quote is asked of shipmentFromQuoteRefusal instead. A link made before this rule stays.
 */
export function shipmentLinkRefusal(status: string): string | null {
  if (status === "won") return null;
  return `the quote is ${quoteStatusLabel(status)} - only a Won quote can be linked to a shipment`;
}

/**
 * The statuses (as shown) a shipment may be created from: an open or expired quote, which the
 * order makes Won as the shipment is created, and a Won one. A Lost or Replaced quote would stay
 * as it is, so no shipment is made from it.
 */
export const SHIPMENT_SOURCE_STATUSES: readonly string[] = ["draft", "ready_to_send", "quoted", "feedback", "revised", "expired", "won"];

/**
 * Why no shipment may be created from a quote in this status - the one it is shown with -
 * finishing the sentence "QCZ… - …"; null when one may ("Create shipment", which makes it Won).
 */
export function shipmentFromQuoteRefusal(status: string): string | null {
  if (SHIPMENT_SOURCE_STATUSES.includes(status)) return null;
  return `the quote is ${quoteStatusLabel(status)} - no shipment can be created from it`;
}

/**
 * Why a quote's costs may not be copied into a shipment's Costs Breakdown ("Copy from quote"),
 * finishing the sentence "QCZ… - …"; null when they may: only a Won quote's costs are.
 */
export function quoteCostCopyRefusal(status: string): string | null {
  if (status === "won") return null;
  return `the quote is ${quoteStatusLabel(status)} - only a Won quote's costs can be copied to a shipment`;
}

/**
 * Whether the user may change what all of Sales shares: the Terms & Conditions templates and the
 * company details printed on quotations. Reading them is open to everybody - no quotation prints
 * without them - but a change shows on everybody's documents.
 */
export function canEditSalesSettings(role: string): boolean {
  return canManageSales(role);
}

/**
 * Whether the user may approve the margin of a road quote that is below the Trucking margin
 * floor. Below the floor a quote is not sent until a manager has approved what it earns.
 */
export function canApproveMargin(role: string): boolean {
  return canManageSales(role);
}

/**
 * How far a user may change the owner of a quote:
 * `any` - a manager: to anybody, or to nobody;
 * `own` - a plain user on their own quote: may hand it to anybody, or give it up;
 * `claim` - a plain user on a quote that belongs to no user: may only take it for themselves;
 * `none` - a plain user on a colleague's quote.
 */
export type OwnerChangeRight = "any" | "own" | "claim" | "none";

export function ownerChangeRight(
  actor: { userID: string; role: string },
  quote: { ownerUserId: string | null },
): OwnerChangeRight {
  if (canManageSales(actor.role)) return "any";
  if (quote.ownerUserId === null) return "claim";
  return quote.ownerUserId === actor.userID ? "own" : "none";
}

/**
 * Whether the user may make `targetUserId` (null = nobody) the owner of the quote. Ownership
 * decides whose quote a Draft is, so a plain user must not be able to make a colleague's quote
 * their own.
 */
export function canSetOwner(
  actor: { userID: string; role: string },
  quote: { ownerUserId: string | null },
  targetUserId: string | null,
): boolean {
  const right = ownerChangeRight(actor, quote);
  if (right === "claim") return targetUserId === actor.userID;
  return right !== "none";
}

/**
 * Whether a user may delete a quote and, when not, why: `reason` finishes the sentence
 * "QCZ… - …" the user is shown. `blockedBy` tells a quote nobody can delete as it stands
 * (`shipment`) from one that only this user may not delete (`role`).
 */
export type QuoteDeletePermission = { allowed: true } | { allowed: false; reason: string; blockedBy: "shipment" | "role" };

/**
 * Whether the user may delete the quote. `status` is the stored one. `everSent` - whether the
 * quote went out to the customer at any time - is a fact the lifecycle rules tell (wasEverSent):
 * more than a sent date, since a quote could be set to Quoted without one being recorded.
 * - Nobody deletes a quote a shipment is linked to: the job would lose its commercial record.
 *   The way there is to take the quote's number out of the shipment first.
 * - A manager deletes any other quote.
 * - A plain user deletes only what is theirs and never left the house: a Draft they own that was
 *   never sent. "Draft" alone is not enough - a sent quote can be made a Draft again (Lost ->
 *   Draft) and is still the quotation a customer holds - and neither is "own" by itself, which is
 *   why a plain user cannot make a colleague's quote their own either (canSetOwner).
 */
export function quoteDeletePermission(
  actor: { userID: string; role: string },
  quote: { status: string; ownerUserId: string | null; everSent: boolean; shipmentId: string | null; shipmentJobNumber: string | null },
): QuoteDeletePermission {
  if (quote.shipmentId !== null) {
    const shipment = quote.shipmentJobNumber ? `shipment ${quote.shipmentJobNumber}` : "a shipment";
    return {
      allowed: false,
      reason: `${shipment} was created from this quote - remove the Sales Reference from the shipment first`,
      blockedBy: "shipment",
    };
  }
  if (canManageSales(actor.role)) return { allowed: true };
  if (quote.status === "draft" && quote.ownerUserId === actor.userID && !quote.everSent) return { allowed: true };
  return { allowed: false, reason: "only a manager can delete this quote", blockedBy: "role" };
}
