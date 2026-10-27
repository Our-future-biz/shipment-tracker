import { Subscription } from "encore.dev/pubsub";
import { contactChanged } from "../../customers/topics";
import { quoteLinksService } from "../services/quoteLinks.service";

// The Customer Database owns the contact person; open quotes linked to them (data.customerContactId)
// keep the name, e-mail and phone in their document and follow them here.
export const quotesContactChanged = new Subscription(contactChanged, "quotes-contact-changed", {
  handler: async (event) => {
    await quoteLinksService.contactChanged(event);
  },
});
