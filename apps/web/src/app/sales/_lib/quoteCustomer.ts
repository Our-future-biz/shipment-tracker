import type { CustomerItem } from "@/hooks/useCustomers";
import type { ContactItem } from "@/hooks/useCustomerContacts";
import { fold } from "@/lib/fold";
import type { SalesQuoteData } from "./types";

// Who a quote is for is one unit of seven keys: the link to the Customer Database, the name and
// account type that come with it, and the person the quote goes to - picked from the customer's
// contacts (kept by its id too) or typed. They change together - a name beside another customer's
// link, or one customer's e-mail under another's name, would print on the quotation and send it to
// the wrong address.

/** The keys of a quote that say who it is for. */
export const CUSTOMER_UNIT_KEYS = [
  "customerId",
  "customerName",
  "customerLabel",
  "customerContactId",
  "customerContact",
  "customerEmail",
  "customerPhone",
] as const satisfies readonly (keyof SalesQuoteData)[];

// The keys a picked contact fills and a typed person overwrites.
const CONTACT_TEXT_KEYS = ["customerContact", "customerEmail", "customerPhone"] as const satisfies readonly (keyof SalesQuoteData)[];

/** A quote for nobody: each of the seven keys emptied. */
export const NO_CUSTOMER: SalesQuoteData = {
  customerId: undefined,
  customerName: undefined,
  customerLabel: undefined,
  // Null rather than left out: a save that leaves the key out keeps a link the server has stored.
  customerContactId: null,
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

// A contact person, e-mail or phone that comes without a contact's id was typed, or read from an
// inquiry or a document: the quote stops following the saved contact, whose values the server
// would otherwise write over it on the next save. The same values again change nothing.
function typedContact(draft: SalesQuoteData, patch: Partial<SalesQuoteData>): Partial<SalesQuoteData> {
  if ("customerContactId" in patch) return patch;
  const retyped = CONTACT_TEXT_KEYS.some((key) => key in patch && (patch[key] ?? "") !== (draft[key] ?? ""));
  return retyped ? { ...patch, customerContactId: null } : patch;
}

// A change to a quote, made safe for its customer - whatever brings it: the customer picker, an
// imported inquiry, a copied quote or shipment. A change that names another customer takes the
// whole unit with it: what it does not bring of the seven keys is emptied, so nothing of the
// previous customer stays behind. Any other change is applied as it comes.
export function withCustomerUnit(draft: SalesQuoteData, patch: Partial<SalesQuoteData>): Partial<SalesQuoteData> {
  if (changesCustomer(draft, patch)) return { ...NO_CUSTOMER, ...patch };
  // The linked customer named again by its name alone, as an inquiry does: the quote keeps the
  // name its link came with, not the inquiry's spelling of it.
  if (draft.customerId && "customerName" in patch && !("customerId" in patch)) {
    const rest = { ...patch };
    delete rest.customerName;
    return typedContact(draft, rest);
  }
  return typedContact(draft, patch);
}

// What ties a quote to the customer it is made for: the link to the Customer Database, and the
// name and account type as they are today.
export function customerLinkFields(customer: Pick<CustomerItem, "id" | "companyName" | "label">): SalesQuoteData {
  return { customerId: customer.id, customerName: customer.companyName, customerLabel: customer.label };
}

type ContactRef = Pick<ContactItem, "id" | "name" | "email" | "phone">;

/** What a contact picked from the customer's contacts puts on a quote: its link, and its name, e-mail and phone as they are now. */
export function contactFields(contact: ContactRef): SalesQuoteData {
  return { customerContactId: contact.id, customerContact: contact.name, customerEmail: contact.email, customerPhone: contact.phone };
}

// A name as two people's names are compared: case, accents and spacing aside ("petr  masak" is
// "Petr Masák"), as the server matches a contact name.
const nameKey = (name: string) => fold(name).trim().replace(/\s+/g, " ");

/** The one contact whose name this is (case, accents and spacing aside); none when no contact or several have it. */
export function contactOfName<T extends Pick<ContactItem, "name">>(contacts: readonly T[], name: string | null | undefined): T | undefined {
  const wanted = nameKey(name ?? "");
  if (!wanted) return undefined;
  const same = contacts.filter((contact) => nameKey(contact.name) === wanted);
  return same.length === 1 ? same[0] : undefined;
}

// An e-mail or phone as two copies of it are compared: case and spaces aside.
const detailKey = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, "").toLowerCase();

/**
 * The saved contact a contact person typed on a quote is (contactOfName), while the quote is not
 * linked to one. `keepsDetails`: linking keeps what the quote holds of the person - its e-mail and
 * phone are empty or already the contact's. Linking writes the contact's e-mail and phone over
 * them, so a link that would not keep them is only offered, never made silently.
 */
export function namedContact<T extends ContactRef>(
  contacts: readonly T[],
  draft: Pick<SalesQuoteData, "customerContactId" | "customerContact" | "customerEmail" | "customerPhone">,
): { contact: T; keepsDetails: boolean } | undefined {
  if (draft.customerContactId) return undefined;
  const contact = contactOfName(contacts, draft.customerContact);
  if (!contact) return undefined;
  const keeps = (typed: string | undefined, own: string) => !detailKey(typed) || detailKey(typed) === detailKey(own);
  return { contact, keepsDetails: keeps(draft.customerEmail, contact.email) && keeps(draft.customerPhone, contact.phone) };
}

// The person a quote for a customer goes to: the contact `wanted` names - by its id, else by its
// name (what a copied shipment carries) - or else the customer's main CRM contact, or its first
// one when none is marked as the main. Nothing for a customer without contacts.
export function contactFieldsOf(
  contacts: (ContactRef & Pick<ContactItem, "isMain">)[],
  wanted: { id?: string | null; name?: string } = {},
): SalesQuoteData {
  const contact =
    (wanted.id ? contacts.find((c) => c.id === wanted.id) : undefined) ??
    contactOfName(contacts, wanted.name) ??
    contacts.find((c) => c.isMain) ??
    contacts[0];
  return contact ? contactFields(contact) : {};
}

/**
 * A contact link copied from another quote, checked against the contacts of the customer copied
 * with it (`contacts`: as the Customer Database has them now; null when they could not be read):
 * kept - with the contact's name, e-mail and phone as they are today - while the person is still
 * one of them; else ended, the name staying as typed text. The server refuses to save a link to
 * anyone else.
 */
export function withContactChecked(patch: Partial<SalesQuoteData>, contacts: readonly ContactRef[] | null): Partial<SalesQuoteData> {
  const contactId = patch.customerContactId;
  if (!contactId) return patch;
  const contact = patch.customerId ? contacts?.find((c) => c.id === contactId) : undefined;
  return contact ? { ...patch, ...contactFields(contact) } : { ...patch, customerContactId: null };
}

// A value of the unit as two copies of it are compared: nothing, null and "" alike.
const unitValue = (data: Partial<SalesQuoteData>, key: (typeof CUSTOMER_UNIT_KEYS)[number]) => data[key] ?? "";

/** Whether two documents name the same customer and contact person, with the same copies of them. */
export function sameCustomerUnit(a: Partial<SalesQuoteData>, b: Partial<SalesQuoteData>): boolean {
  return CUSTOMER_UNIT_KEYS.every((key) => unitValue(a, key) === unitValue(b, key));
}

/**
 * Whether the quote page must save before it asks the server for an action, although the user
 * changed nothing: the draft names the customer or contact person otherwise than the stored quote
 * (`stored`, as the server last returned it) - copies the page followed from the Customer Database.
 * An action such as sending freezes the quote as stored, so it must hold what the page shows.
 */
export function customerCopiesUnsaved(draft: Partial<SalesQuoteData>, stored: Partial<SalesQuoteData>): boolean {
  return !sameCustomerUnit(draft, stored);
}

/**
 * The draft after the server answered with the stored quote: who the quote is for as stored - on
 * an open quote the server takes the names, account type, e-mail and phone from the Customer
 * Database with every save - unless the user changed any of it since the server saw the draft
 * (`seen`: what the save sent, or the document last returned). Such a change is still to be
 * saved, and stays.
 */
export function followStoredCustomer<T extends Partial<SalesQuoteData>>(draft: T, seen: Partial<SalesQuoteData>, stored: SalesQuoteData): T {
  if (!sameCustomerUnit(draft, seen)) return draft;
  const next: Record<string, unknown> = { ...draft };
  for (const key of CUSTOMER_UNIT_KEYS) {
    if (stored[key] === undefined) delete next[key];
    else next[key] = stored[key];
  }
  return next as T;
}

/**
 * What a quote's copies of its customer and contact person lack of the Customer Database as it is
 * now: the linked customer's name and account type, and the linked contact's name, e-mail and
 * phone - or, for a contact that is no longer one of the customer's, the end of its link (the name
 * stays, as typed text). `customer` and `contacts` are what was read of the records; left out,
 * nothing is said about them. Empty when the copies are as the records are.
 */
export function liveCustomerCopies(
  draft: SalesQuoteData,
  customer: Pick<CustomerItem, "id" | "companyName" | "label"> | null | undefined,
  contacts: { customerId: string; contacts: ContactRef[] } | undefined,
): Partial<SalesQuoteData> {
  const patch: Partial<SalesQuoteData> = {};
  if (!draft.customerId) return patch;
  const follow = (key: (typeof CUSTOMER_UNIT_KEYS)[number], value: string) => {
    if (unitValue(draft, key) !== value) Object.assign(patch, { [key]: value });
  };
  if (customer && customer.id === draft.customerId) {
    follow("customerName", customer.companyName);
    follow("customerLabel", customer.label);
  }
  if (contacts && contacts.customerId === draft.customerId && draft.customerContactId) {
    const contact = contacts.contacts.find((c) => c.id === draft.customerContactId);
    if (!contact) return { ...patch, customerContactId: null };
    follow("customerContact", contact.name);
    follow("customerEmail", contact.email);
    follow("customerPhone", contact.phone);
  }
  return patch;
}
