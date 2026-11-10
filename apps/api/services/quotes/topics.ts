import { Topic } from "encore.dev/pubsub";

// A sales quote's reference takes the letters of its Freight Mode while the quote is open
// (lib/salesReference, owner decision 10 Nov 2026): QCZ20261109001 becomes QCZLCL20261109001, and
// QCZAIR… when it turns to Air. Other services keep the reference as text next to what they hold (a
// shipment's Sales Reference, a customer's approval, invoicing's costs, a follow-up task, a trucking
// job); this event moves those copies to the new reference. Subscribers rewrite the copies that hold
// `from` and must be idempotent. A copy not moved yet still names the quote: references are looked
// up without their letters.

export interface QuoteRenamedEvent {
  companyId: string;
  /** The reference the quote had. */
  from: string;
  /** The reference it has now. */
  to: string;
}

// Published after a quote's reference changed.
export const quoteRenamed = new Topic<QuoteRenamedEvent>("quote-renamed", {
  deliveryGuarantee: "at-least-once",
});
