import { quoteReferenceNow } from "../../../lib/quoteReferenceNow";
import { serviceActor } from "../../../lib/outbox/serviceIdentity";
import { Subscription } from "encore.dev/pubsub";
import { quoteRenamed } from "../../quotes/topics";
import { shipmentRepository } from "../repositories/shipment.repository";

// A quote's reference took the letters of its Freight Mode (quotes/topics): the shipments that name it
// as their Sales Reference name it as it is now. The same quote, so no edit rule applies - but the
// Sales Reference a shipment shows did change, so its history says so: one line per shipment, old → new.
export const shipmentsQuoteRenamed = new Subscription(quoteRenamed, "shipments-quote-renamed", {
  handler: async ({ companyId, from, to }) => {
    // The event says which quote; what its copies say comes from Sales now (lib/quoteReferenceNow),
    // and every copy of it is found without the Freight Mode letters, whatever spelling it holds.
    const now = await quoteReferenceNow(companyId, from, to);
    // Nobody edited the shipment: the line is the company's service identity's, as every write the
    // system makes on a shipment (no person is named for it). Throws when auth does not answer, so
    // the event comes again.
    const { userID } = await serviceActor(companyId);
    // Only what still differs is rewritten, with its line: an event delivered twice writes none twice.
    await shipmentRepository.followQuoteRename(companyId, from, now, userID);
  },
});
