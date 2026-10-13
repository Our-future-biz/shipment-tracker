import { api } from "@/lib/api";
import type { CustomerItem } from "@/hooks/useCustomers";
import type { SalesQuoteData } from "./types";

// Who a quote is for is one unit of six keys: the link to the Customer Database, the name and
// account type that come with it, and the person the quote goes to. They change together - a
// name beside another customer's link, or one customer's e-mail under another's name, would
// print on the quotation and send it to the wrong address.

/** A quote for nobody: each of the six keys emptied. */
export const NO_CUSTOMER: SalesQuoteData = {
  customerId: undefined,
  customerName: undefined,
  customerLabel: undefined,
  customerContact: undefined,
  customerEmail: undefined,
  customerPhone: undefined,
};

// Upper and lower case and spaces around a name do not make it another company's.
const sameName = (a?: string, b?: string) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

// Whether a change to a quote names another customer than the quote has: another record of the
// Customer Database - or none, where the quote has one - or, without a record, another name.
// A change that only edits the contact person names nobody. Nor does a name alone given to a
// quote that names nobody yet: no other customer's details can stand on such a quote, and the
// contact typed there was typed for whoever is now named - a company that is not in the
// Customer Database gets its name from an inquiry only.
export function changesCustomer(draft: SalesQuoteData, patch: Partial<SalesQuoteData>): boolean {
  if ("customerId" in patch && (patch.customerId || undefined) !== (draft.customerId || undefined)) return true;
  if (patch.customerId || !("customerName" in patch)) return false;
  const named = !!(draft.customerId || draft.customerName?.trim());
  return named && !sameName(patch.customerName, draft.customerName);
}

// A change to a quote, made safe for its customer - whatever brings it: the customer picker, an
// imported inquiry, a copied quote or shipment. A change that names another customer takes the
// whole unit with it: what it does not bring of the six keys is emptied, so nothing of the
// previous customer stays behind. Any other change is applied as it comes.
export function withCustomerUnit(draft: SalesQuoteData, patch: Partial<SalesQuoteData>): Partial<SalesQuoteData> {
  if (changesCustomer(draft, patch)) return { ...NO_CUSTOMER, ...patch };
  // The linked customer named again by its name alone, as an inquiry does: the quote keeps the
  // name its link came with, not the inquiry's spelling of it.
  if (draft.customerId && "customerName" in patch && !("customerId" in patch)) {
    const rest = { ...patch };
    delete rest.customerName;
    return rest;
  }
  return patch;
}

// What ties a quote to the customer it is made for: the link to the Customer Database, and the
// name and account type as they are today.
export function customerLinkFields(customer: Pick<CustomerItem, "id" | "companyName" | "label">): SalesQuoteData {
  return { customerId: customer.id, customerName: customer.companyName, customerLabel: customer.label };
}

// The person a quote for a customer goes to: the customer's main CRM contact, or its first one
// when none is marked as the main. Nothing for a customer without contacts, or whose contacts
// cannot be read - the contact fields stay editable on the quote.
export async function customerContactFields(customerId: string): Promise<SalesQuoteData> {
  try {
    const contacts = (await api.customers.contactList(customerId)).data;
    const main = contacts.find((contact) => contact.isMain) ?? contacts[0];
    return main ? { customerContact: main.name, customerEmail: main.email, customerPhone: main.phone } : {};
  } catch {
    return {};
  }
}

// What a new quote for a customer starts with: both of the above.
export async function customerQuoteFields(customer: Pick<CustomerItem, "id" | "companyName" | "label">): Promise<SalesQuoteData> {
  return { ...customerLinkFields(customer), ...(await customerContactFields(customer.id)) };
}
