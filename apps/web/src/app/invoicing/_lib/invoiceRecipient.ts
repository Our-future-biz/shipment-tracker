// Whom the e-mail with a just issued invoice is addressed to.

interface Contact {
  id: string;
  email: string;
  role: string;
  isMain: boolean;
  createdAt: string;
}

// As a payment reminder (customers lib/receivable reminderContact, D17): Accounts payable, else Finance / Accounting.
const ACCOUNTS_ROLES = ["Accounts payable", "Finance / Accounting"] as const;

/**
 * The billed customer's contact for its invoices, as a payment reminder picks it: the one with the role Accounts
 * payable, else Finance / Accounting, else the main contact - each only with an e-mail; among several, the main one,
 * then the oldest. "" when there is none.
 */
export function accountsContactEmail(contacts: readonly Contact[]): string {
  const withEmail = contacts
    .filter((c) => c.email.trim() !== "")
    .sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const pick = ACCOUNTS_ROLES.map((role) => withEmail.find((c) => c.role === role)).find(Boolean) ?? withEmail.find((c) => c.isMain);
  return pick?.email.trim() ?? "";
}

/**
 * The invoice e-mail's recipient: the shipment's Customer's contact (`picEmail`, when the invoice bills the shipment's
 * customer), else the billed customer's accounts contact as a reminder picks it (user council B20: the recipient was
 * left empty although the customer has a main contact). The contacts count only when they are the billed customer's.
 */
export function invoiceRecipient(picEmail: string, billed: { customerId: string; contactsOf: string; contacts: readonly Contact[] }): string {
  if (picEmail.trim()) return picEmail.trim();
  return billed.customerId === billed.contactsOf ? accountsContactEmail(billed.contacts) : "";
}
