// An email started from a shipment's Customer's PIC: its subject, and who else at that customer can
// be copied in.

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

/** The customer's other contacts, for the choice of who to copy in. */
export function otherContacts<T extends { id: string }>(contacts: readonly T[], contact: T): T[] {
  return contacts.filter((c) => c.id !== contact.id);
}
