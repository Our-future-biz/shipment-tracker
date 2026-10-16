import { APIError } from "encore.dev/api";

// The buy-price lock (owner decision 7, 16 Oct 2026): a trip's buy price is locked once its
// transport order is sent - a partner delivery's once the partner was given it (it is in the
// partner's portal from then on). A manager may still change it with a reason until the trip or
// delivery is on a haulier invoice that is not rejected; never after. Pure.

export interface BuyLockFacts {
  /** What is priced, as the refusal names it: "Trip LCZ2600000012", "TCZ2600000040 partner delivery" */
  what: string;
  /** The order went out to the haulier (trip: transport order sent; partner delivery: given to the partner) */
  orderOut: boolean;
  /** The number of the haulier invoice (not rejected) it is on, if any */
  invoiceNumber: string | null;
  manager: boolean;
  /** The reason given for the change ("" = none) */
  reason: string;
}

/**
 * Throws when the buy price may not change now: on an invoice (anyone), the order out and not a
 * manager, or a manager without a reason. Answers whether the change is a reprice after the
 * order went out (to be flagged and kept out of invoice auto-approval).
 */
export function assertBuyChangeAllowed(f: BuyLockFacts): { afterOrder: boolean } {
  if (f.invoiceNumber) throw APIError.failedPrecondition(`${f.what} is on haulier invoice ${f.invoiceNumber}: its price can no longer change`);
  if (!f.orderOut) return { afterOrder: false };
  if (!f.manager) throw APIError.permissionDenied(`The order for ${f.what} went out to the haulier: only a manager can change its price, with a reason`);
  if (f.reason.trim().length < 3) throw APIError.invalidArgument(`Give the reason for changing the price of ${f.what} after the order went out (3 to 500 characters)`);
  return { afterOrder: true };
}
