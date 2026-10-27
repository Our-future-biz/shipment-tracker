import { Subscription } from "encore.dev/pubsub";
import { customerChanged } from "../../customers/topics";
import { quoteLinksService } from "../services/quoteLinks.service";

// The Customer Database owns the customer; open quotes keep its name and account type in their
// document and follow it here. Sent quotes stay as they were sent.
export const quotesCustomerChanged = new Subscription(customerChanged, "quotes-customer-changed", {
  handler: async (event) => {
    await quoteLinksService.customerChanged(event);
  },
});
