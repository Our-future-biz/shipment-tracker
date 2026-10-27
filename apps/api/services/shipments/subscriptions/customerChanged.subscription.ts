import { Subscription } from "encore.dev/pubsub";
import { customerChanged } from "../../customers/topics";
import { partyLinksService } from "../services/partyLinks.service";
import { isRedelivery } from "../lib/delivery";

// A customer edited or deleted in the Customer Database: its shipments and master jobs show its
// name. Runs without a signed-in user; the name written is read from the Customer Database (the
// event's only once the customer is deleted).
export const shipmentsCustomerChanged = new Subscription(customerChanged, "shipments-customer-changed", {
  handler: async (event) => {
    await partyLinksService.customerChanged(event, { redelivered: isRedelivery() });
  },
});
