// Who a quote is for, as the Customer Database has it. The document keeps text copies (for the
// list, its search and sort, the CSV, the PDF and the e-mail) next to the ids they were copied
// from, and while the quote is open those copies follow the Customer Database: "everything must be
// linked" (owner, 26 Oct 2026). Pure functions only: the services read the Customer Database.

import type { CustomerContactRef, CustomerRef } from "../../customers/interfaces/interfaces";
import { normaliseName } from "../../../lib/personName";
import { isUuid } from "../../../lib/uuid";
import { isPlainObject, isWonRevision } from "./quoteDocument.utils";

/**
 * The statuses in which a quote's copies of its customer (customerName, customerLabel) and of its
 * contact person (customerContact, customerEmail, customerPhone) follow the Customer Database: the
 * quote has not gone out as it stands - Draft, Ready to Send, and a Revised quote waiting to be
 * sent again. So does the revision of a Won quote (isWonRevision), whose document stays open to
 * change. Every other status - Quoted, Feedback, Won, Lost, Expired, Replaced (PRICING_CLOSED) - is
 * what the customer was given and stays a snapshot (closedCarryKeys). A Won quote is a snapshot
 * whether or not a shipment was made from it yet: it was sent and decided, and a shipment made from
 * it takes the customer and the contact by their ids.
 */
export const LINKED_COPY_STATUSES: readonly string[] = ["draft", "ready_to_send", "revised"];

/** Whether a quote's customer and contact copies follow the Customer Database (LINKED_COPY_STATUSES). */
export function copiesFollowCustomers(status: string | null, data: unknown): boolean {
  if (status === null) return false;
  return LINKED_COPY_STATUSES.includes(status) || isWonRevision(status, data);
}

/** The keys of the document that hold who a quote is for. */
export const CUSTOMER_KEYS = {
  customerId: "customerId",
  customerName: "customerName",
  customerLabel: "customerLabel",
  /**
   * The id of the contact person picked from the customer's contacts. "" = typed by hand on purpose
   * (or none): never linked by name again. Absent = a quote from before contacts were linked, which
   * only the backfill may link by name.
   */
  customerContactId: "customerContactId",
  customerContact: "customerContact",
  customerEmail: "customerEmail",
  customerPhone: "customerPhone",
} as const;

/** The customers and their live contacts as the Customer Database has them now (_internalCustomerRefs). */
export interface CustomerRefs {
  customers: CustomerRef[];
  contacts: CustomerContactRef[];
}

const text = (doc: Record<string, unknown>, key: string): string => (typeof doc[key] === "string" ? (doc[key] as string).trim() : "");
// Ids as Postgres writes them (lower case), so they compare with the Customer Database's.
const idOf = (doc: Record<string, unknown>, key: string): string | null => {
  const value = text(doc, key);
  return value && isUuid(value) ? value.toLowerCase() : null;
};

/** The customer record a document names (data.customerId), or null. */
export const customerIdOf = (doc: Record<string, unknown>) => idOf(doc, CUSTOMER_KEYS.customerId);
/** The contact record a document names (data.customerContactId), or null. */
export const contactIdOf = (doc: Record<string, unknown>) => idOf(doc, CUSTOMER_KEYS.customerContactId);

/**
 * The contact a contact name typed or copied before contacts were linked stands for, among the
 * live contacts of the quote's customer: (1) the one whose name is the same, ignoring case,
 * accents and spacing; else (2) the only one whose name starts with the text as whole words
 * ("Petr" -> "Petr Masák"). Null when neither finds exactly one: a guess could send the quotation
 * to the wrong person.
 */
export function matchContact(name: string, contacts: CustomerContactRef[]): CustomerContactRef | null {
  const wanted = normaliseName(name);
  if (!wanted) return null;
  const same = contacts.filter((contact) => normaliseName(contact.name) === wanted);
  if (same.length) return same.length === 1 ? same[0]! : null;
  const starting = contacts.filter((contact) => normaliseName(contact.name).startsWith(`${wanted} `));
  return starting.length === 1 ? starting[0]! : null;
}

/** What a contact person puts into the document. */
const contactFields = (contact: CustomerContactRef): Record<string, string> => ({
  [CUSTOMER_KEYS.customerContactId]: contact.id,
  [CUSTOMER_KEYS.customerContact]: contact.name,
  [CUSTOMER_KEYS.customerEmail]: contact.email,
  [CUSTOMER_KEYS.customerPhone]: contact.phone,
});

/** What a customer puts into the document. */
const customerFields = (customer: CustomerRef): Record<string, string> => ({
  [CUSTOMER_KEYS.customerName]: customer.companyName,
  [CUSTOMER_KEYS.customerLabel]: customer.label,
});

export type SaveLinks =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; code: "invalid" | "unavailable"; message: string };

/** The value of data.customerContactId for a contact typed by hand (or none). */
export const HAND_TYPED_CONTACT = "";

/**
 * A document as an editor sends it (save, create, duplicate), with its customer copies taken from
 * the Customer Database: the customer's current name and account type when it names a customer
 * record, and the contact's current name, e-mail and phone when it names a contact person.
 *
 * `customerContactId` in the document: a contact of the quote's customer; null or "" = the contact
 * was typed by hand (or there is none), stored as "" so nothing links it by name later. Left out,
 * the stored link is kept as long as the customer and the contact name are the ones stored - an
 * editor that does not know the key does not undo a link; a contact name it changed counts as
 * typed by hand. With nothing stored for the same customer the key stays absent.
 * `stored`: the document as stored before this save; null for a new quote.
 * `refs`: the Customer Database for the document's customer; null when it could not be read - the
 * document is then taken as sent, except a newly picked contact, which cannot be checked.
 */
export function linkForSave(incoming: Record<string, unknown>, stored: Record<string, unknown> | null, refs: CustomerRefs | null): SaveLinks {
  const data = { ...incoming };
  const customerId = customerIdOf(data);
  const before = stored ?? {};
  const sameCustomer = customerId !== null && customerIdOf(before) === customerId;
  const storedContactId = sameCustomer ? contactIdOf(before) : null;

  let contactId: string | null;
  // Whether the editor decided who the contact is (a link, or typed by hand): then the key is written.
  let decided: boolean;
  if (Object.hasOwn(incoming, CUSTOMER_KEYS.customerContactId)) {
    const raw = incoming[CUSTOMER_KEYS.customerContactId];
    if (raw === null || raw === undefined || raw === "") contactId = null;
    else if (typeof raw === "string" && isUuid(raw.trim())) contactId = raw.trim().toLowerCase();
    else return { ok: false, code: "invalid", message: "customerContactId must be the id of a contact person" };
    decided = true;
  } else {
    // Kept only for the same customer and the same contact name.
    contactId = storedContactId && text(incoming, CUSTOMER_KEYS.customerContact) === text(before, CUSTOMER_KEYS.customerContact) ? storedContactId : null;
    decided = sameCustomer && Object.hasOwn(before, CUSTOMER_KEYS.customerContactId);
  }
  delete data[CUSTOMER_KEYS.customerContactId];
  if (contactId && !customerId) {
    return { ok: false, code: "invalid", message: "A contact person can be linked only together with the customer" };
  }
  // No contact linked: "" once an editor decided so, else (a quote from before) nothing.
  const unlinked = (doc: Record<string, unknown>) => (decided ? { ...doc, [CUSTOMER_KEYS.customerContactId]: HAND_TYPED_CONTACT } : doc);
  const linkedTo = (doc: Record<string, unknown>, id: string) => ({ ...doc, [CUSTOMER_KEYS.customerContactId]: id });
  if (!customerId) return { ok: true, data: unlinked(data) };

  if (!refs) {
    if (contactId && contactId !== storedContactId) {
      return { ok: false, code: "unavailable", message: "The Customer Database cannot be read to check the contact person - try again" };
    }
    return { ok: true, data: contactId ? linkedTo(data, contactId) : unlinked(data) };
  }

  // A customer that is not live (deleted) keeps the name the quote has.
  const customer = refs.customers.find((c) => c.id === customerId);
  if (customer) Object.assign(data, customerFields(customer));
  if (!contactId) return { ok: true, data: unlinked(data) };

  const contact = refs.contacts.find((c) => c.id === contactId && c.customerId === customerId);
  if (contact) return { ok: true, data: { ...data, ...contactFields(contact) } };
  if (contactId === storedContactId) {
    // The contact was deleted since: the name stays, as typed text. Of a deleted customer the
    // contacts are not known: the link stays as it was.
    return { ok: true, data: customer ? unlinked(data) : linkedTo(data, contactId) };
  }
  return { ok: false, code: "invalid", message: "The contact person is not a contact of this customer" };
}

/** What bringing a document's copies up to date changes. */
export interface CopiesRefresh {
  /** The keys to set, with their values. */
  set: Record<string, string>;
  /** The document names a customer record that is not live (deleted, or not of the company). */
  customerMissing: boolean;
  /** A contact name that could not be linked to a contact of the customer (matchContact); "" when none. */
  unmatchedContact: string;
}

/**
 * Brings the customer copies of a stored open quote up to date with the Customer Database (the
 * backfill, and a revision made from a sent quote): the customer's name and account type by its id;
 * the contact's name, e-mail and phone by its id. A link to a contact that is gone becomes "typed
 * by hand", its name kept. With `linkByName` (the backfill only), a contact of a quote from before
 * contacts were linked - no customerContactId key at all - is linked by its name (matchContact);
 * one an editor typed by hand ("") never is. Only what differs is set.
 */
export function refreshCopies(doc: unknown, refs: CustomerRefs, options: { linkByName: boolean }): CopiesRefresh {
  const result: CopiesRefresh = { set: {}, customerMissing: false, unmatchedContact: "" };
  if (!isPlainObject(doc)) return result;
  const customerId = customerIdOf(doc);
  if (!customerId) return result;
  const changed = (fields: Record<string, string>) => {
    for (const [key, value] of Object.entries(fields)) if (doc[key] !== value) result.set[key] = value;
  };

  const customer = refs.customers.find((c) => c.id === customerId);
  if (customer) changed(customerFields(customer));
  else result.customerMissing = true;

  const contacts = refs.contacts.filter((c) => c.customerId === customerId);
  const contactId = contactIdOf(doc);
  if (contactId) {
    const contact = contacts.find((c) => c.id === contactId);
    if (contact) changed(contactFields(contact));
    // A deleted customer: its contacts are not known; the link stays.
    else if (customer) changed({ [CUSTOMER_KEYS.customerContactId]: HAND_TYPED_CONTACT });
    return result;
  }
  // Decided by an editor: typed by hand. Any other value under the key is no link either.
  if (Object.hasOwn(doc, CUSTOMER_KEYS.customerContactId)) {
    changed({ [CUSTOMER_KEYS.customerContactId]: HAND_TYPED_CONTACT });
    return result;
  }
  const name = text(doc, CUSTOMER_KEYS.customerContact);
  if (!options.linkByName || !name || !customer) return result;
  const contact = matchContact(name, contacts);
  if (contact) changed(contactFields(contact));
  else result.unmatchedContact = name;
  return result;
}

/** A document with a refresh applied. */
export function withRefresh(doc: Record<string, unknown>, refresh: CopiesRefresh): Record<string, unknown> {
  return { ...doc, ...refresh.set };
}
