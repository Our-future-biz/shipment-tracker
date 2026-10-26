import { Subscription } from "encore.dev/pubsub";
import { contactChanged } from "../../customers/topics";
import { partyLinksService } from "../services/partyLinks.service";
import { isRedelivery } from "../lib/delivery";

// A contact person edited or deleted in the Customer Database: the Customer's PIC and the Shipper /
// Consignee Contacts that link to it show its name, read from the Customer Database (the event's
// only once the contact is deleted).
export const shipmentsContactChanged = new Subscription(contactChanged, "shipments-contact-changed", {
  handler: async (event) => {
    await partyLinksService.contactChanged(event, { redelivered: isRedelivery() });
  },
});
