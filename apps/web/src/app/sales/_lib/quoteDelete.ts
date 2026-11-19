import type { interfaces } from "@/lib/api/client";

type QuotePermissions = interfaces.SalesQuoteItem["permissions"];

/**
 * How the quote page offers "Delete quote", from what the server says may be done with the quote:
 * `offer` when it would be deleted; the server's reason, under a disabled item, when nobody may as
 * the quote stands - a shipment or trucking job names it, it went to the customer or is on its way
 * there, it is the revision of a Replaced quote, it is the original offer of a variant or revision -
 * so the confirmation is never offered only to be refused; `hide` when only this user may not, for
 * want of a role.
 */
export function quoteDeleteOffer(permissions: QuotePermissions): "offer" | "hide" | { reason: string } {
  if (permissions.canDelete) return "offer";
  if (permissions.deleteBlockedBy === "role" || !permissions.deleteBlockedReason) return "hide";
  return { reason: permissions.deleteBlockedReason };
}
