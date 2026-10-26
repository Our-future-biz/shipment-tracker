import { Subscription } from "encore.dev/pubsub";
import { customerChanged } from "../../customers/topics";
import { customerLinksService } from "../services/customerLinks.service";

// The Customer Database owns company names; Trucking keeps them next to the id (a consignment's
// customer, a trip's haulier) for its lists, search and exports. A rename there is written here:
// the event is a signal, and the name written is the one the Customer Database holds now.
export const truckingCustomerChanged = new Subscription(customerChanged, "trucking-customer-changed", {
  handler: async (event) => {
    await customerLinksService.customerChanged(event);
  },
});
