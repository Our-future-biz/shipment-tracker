import { Topic } from "encore.dev/pubsub";

// The Customer Database is where a customer's name and its contact people live. Other services
// keep copies of them (a shipment's Customer / Shipper / Consignee and its Customer's PIC, open
// quotes, follow-ups, trucking jobs, …) next to the id, so their lists can be searched and
// exported as text. These events keep those copies current: "everything must be linked"
// (owner, 26 Oct 2026). Subscribers rewrite the copies that hold the id; they must be idempotent.

export interface CustomerChangedEvent {
  companyId: string;
  customerId: string;
  /** The current company name. */
  companyName: string;
  /** The current account type (KEY ACCOUNT, STANDARD, …). */
  label: string;
  /** True when the customer was deleted (hidden); false for an edit or a restore. */
  deleted: boolean;
}

// Published after a customer is edited, deleted or restored.
export const customerChanged = new Topic<CustomerChangedEvent>("customer-changed", {
  deliveryGuarantee: "at-least-once",
});

export interface ContactChangedEvent {
  companyId: string;
  customerId: string;
  contactId: string;
  /** The current "First Last" name. */
  name: string;
  email: string;
  phone: string;
  /** True when the contact was deleted (hidden). */
  deleted: boolean;
}

// Published after a contact person is edited or deleted.
export const contactChanged = new Topic<ContactChangedEvent>("contact-changed", {
  deliveryGuarantee: "at-least-once",
});
