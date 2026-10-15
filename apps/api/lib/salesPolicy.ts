// Who may do what in Sales. THE ONE PLACE with role logic for it: the API asks these functions,
// and the screens only ever see their answers as flags on what they load. Pure, so the whole
// policy is covered by a unit test - and changing it means changing this file.

import type { Role } from "./rbac";

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
 * Whether the user may change what all of Sales shares: the Terms & Conditions templates and the
 * company details printed on quotations. Reading them is open to everybody - no quotation prints
 * without them - but a change shows on everybody's documents.
 */
export function canEditSalesSettings(role: string): boolean {
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
      reason: `${shipment} was created from this quote - remove the Sales Number from the shipment first`,
      blockedBy: "shipment",
    };
  }
  if (canManageSales(actor.role)) return { allowed: true };
  if (quote.status === "draft" && quote.ownerUserId === actor.userID && !quote.everSent) return { allowed: true };
  return { allowed: false, reason: "only a manager can delete this quote", blockedBy: "role" };
}
