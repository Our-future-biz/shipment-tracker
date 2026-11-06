import { findContact } from "@/hooks/useCustomerContacts";

// An email started from a shipment: its subject, who else at the customer can be copied in, and who
// its invoice goes to.

const SUBJECT_SEPARATOR = " // ";

/** "Internal Reference // Customer Reference"; the Internal Reference alone while there is no Customer Reference. */
export function shipmentEmailSubject(shipment: { jobNumber?: string | null; customerReference?: string | null }): string {
  return [shipment.jobNumber, shipment.customerReference]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(SUBJECT_SEPARATOR);
}

const sameAddress = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Whether `other` can be put in copy on an email to `to`: it has an address, and not the same one. */
export function canBeCopied(other: { email: string }, to: { email: string }): boolean {
  return !!other.email.trim() && !sameAddress(other.email, to.email);
}

/**
 * Who the email with an invoice goes to: the shipment's Customer's PIC, when the invoice bills the
 * shipment's customer. "" otherwise (another company is billed, no PIC, a PIC with no address): the
 * user fills it in.
 */
export function invoiceEmailTo(
  shipment: { customerId?: string | null; customerPic?: string | null; customerPicContactId?: string | null },
  billedCustomerId: string,
  contacts: readonly { id: string; name: string; email: string }[],
): string {
  if (billedCustomerId !== shipment.customerId) return "";
  return findContact(contacts, shipment.customerPicContactId, shipment.customerPic)?.email.trim() ?? "";
}

/** The customer's other contacts, for the choice of who to copy in. */
export function otherContacts<T extends { id: string }>(contacts: readonly T[], contact: T): T[] {
  return contacts.filter((c) => c.id !== contact.id);
}
