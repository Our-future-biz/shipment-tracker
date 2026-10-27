import { Subscription } from "encore.dev/pubsub";
import { customerChanged } from "../../customers/topics";
import { followupLinksService } from "../services/followupLinks.service";

// The Customer Database owns the customer; follow-up tasks linked to it keep its name and follow it here.
export const salesCustomerChanged = new Subscription(customerChanged, "sales-customer-changed", {
  handler: async (event) => {
    await followupLinksService.customerChanged(event);
  },
});
