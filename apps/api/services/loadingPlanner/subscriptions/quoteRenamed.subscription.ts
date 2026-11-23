import { Subscription } from "encore.dev/pubsub";
import { quoteReferenceNow } from "../../../lib/quoteReferenceNow";
import { quoteRenamed } from "../../quotes/topics";
import { loadingPlanService } from "../services/loadingPlan.service";

// A quote's reference took the letters of its Freight Mode (quotes/topics): the loading plans
// linked to that quote name it as it is now.
export const loadingPlannerQuoteRenamed = new Subscription(quoteRenamed, "loading-planner-quote-renamed", {
  handler: async ({ companyId, from, to }) => {
    // The event says which quote; what its copies say comes from Sales now (lib/quoteReferenceNow),
    // and every copy of it is found without the Freight Mode letters, whatever spelling it holds.
    // Throws when Sales does not answer, so the event comes again.
    const now = await quoteReferenceNow(companyId, from, to);
    // Only what still differs is rewritten: an event delivered twice writes nothing twice.
    await loadingPlanService.followQuoteRename(companyId, from, now);
  },
});
