import { APIError } from "encore.dev/api";
import { normaliseName } from "../../../lib/personName";
import type { UnmatchedLink } from "../interfaces/interfaces";

// "Everything must be linked" (owner, 26 Oct 2026). A shipment keeps the names of its parties and
// their contact people as text - the grid searches, filters and exports them - and next to each
// the id of the Customer Database record it copies. The customers service publishes a change
// event, and the copies holding the id are rewritten (services/partyLinks.service.ts). These are
// the pure rules for writing a contact link and for linking the names stored before the ids.

/** A contact person of a Customer Database customer, as a shipment links to it. */
export interface LinkContact {
  id: string;
  name: string;
  isMain?: boolean;
}

/** The live contacts of a customer (read at most once per write). */
export type ContactsOf = (customerId: string) => Promise<LinkContact[]>;

/** Where a shipment keeps a contact: its name, its id, and the party whose contact it is. */
export interface ContactSlot {
  text: "customerPic" | "shipperContact" | "consigneeContact";
  id: "customerPicContactId" | "shipperContactId" | "consigneeContactId";
  party: "customerId" | "shipperId" | "consigneeId";
}

export const CUSTOMER_PIC: ContactSlot = { text: "customerPic", id: "customerPicContactId", party: "customerId" };
export const SHIPPER_CONTACT: ContactSlot = { text: "shipperContact", id: "shipperContactId", party: "shipperId" };
export const CONSIGNEE_CONTACT: ContactSlot = { text: "consigneeContact", id: "consigneeContactId", party: "consigneeId" };
export const CONTACT_SLOTS = [CUSTOMER_PIC, SHIPPER_CONTACT, CONSIGNEE_CONTACT] as const;

/**
 * What a name that is no contact of the party does:
 * - "strict": refused (Customer's PIC on an edit);
 * - "lenient": left out (Customer's PIC on create - a quote or another service may name somebody
 *   who is no contact (any more), which must not fail the whole shipment);
 * - "free": kept as typed, with no id (a shipper's or consignee's Contact may be anybody).
 */
export type ContactMode = "strict" | "lenient" | "free";

/** The one contact `value` names, as typed in a write: the exact name in any case. */
export function contactNamed<T extends { name: string }>(value: string, contacts: readonly T[]): T | null {
  const wanted = value.trim().toLowerCase();
  if (!wanted) return null;
  return contacts.find((c) => c.name.trim().toLowerCase() === wanted) ?? null;
}

/**
 * The contact a name stored before the links were kept stands for: the same name without regard
 * to case or diacritics (the main contact first, should two share it), else the only contact
 * whose name starts with it as whole words ("Petr" for "Petr Masák"). Null when neither finds one.
 */
export function matchContact<T extends LinkContact>(value: string, contacts: readonly T[]): T | null {
  const wanted = normaliseName(value);
  if (!wanted) return null;
  const exact = contacts.filter((c) => normaliseName(c.name) === wanted);
  if (exact.length) return exact.find((c) => c.isMain) ?? exact[0]!;
  const starting = startingWith(wanted, contacts);
  return starting.length === 1 ? starting[0]! : null;
}

/** The contacts whose name starts with `wanted` (normalised) as whole words. */
const startingWith = <T extends LinkContact>(wanted: string, contacts: readonly T[]): T[] =>
  contacts.filter((c) => normaliseName(c.name).startsWith(`${wanted} `));

function refusal(slot: ContactSlot, partyId: string | null): APIError {
  if (slot !== CUSTOMER_PIC) return APIError.invalidArgument("Contact: pick a contact saved for this party in the Customer Database");
  return partyId
    ? APIError.invalidArgument("Customer's PIC: pick a contact saved for this customer in the Customer Database")
    : APIError.invalidArgument("Customer's PIC: link the shipment to a customer first, then pick one of its contacts");
}

const write = (data: Record<string, unknown>, slot: ContactSlot, contact: LinkContact | null) => {
  data[slot.text] = contact ? contact.name.trim() : "";
  data[slot.id] = contact ? contact.id : null;
};

/**
 * Settles one contact of a write (`data`, changed in place) against the shipment as stored
 * (`existing`; none on create): the contact's id and its current name are written together.
 * - An id sent must be a contact of the party (the party of the same write, else the stored one).
 * - A name sent is matched to the party's contacts (exact, any case); see ContactMode for one that
 *   is no contact. A blank name, or a null id with no name, clears both.
 * - What the shipment already holds passes as it is, without asking the Customer Database.
 * - When the party changes, the stored contact stays only while it is a contact of the new party
 *   (a typed Contact of a shipper or consignee stays); otherwise name and id are cleared.
 */
export async function linkContact(
  data: Record<string, unknown>,
  existing: Record<string, unknown> | undefined,
  slot: ContactSlot,
  contactsOf: ContactsOf,
  mode: ContactMode,
): Promise<void> {
  const partyId = ((slot.party in data ? data[slot.party] : existing?.[slot.party]) as string | null | undefined) || null;
  const partyChanged = !!existing && slot.party in data && partyId !== ((existing[slot.party] as string | null | undefined) || null);
  const storedText = String(existing?.[slot.text] ?? "");
  const storedId = ((existing?.[slot.id] as string | null | undefined) || null);
  // undefined: not part of the write; null: cleared.
  const sentId = slot.id in data ? ((data[slot.id] as string | null | undefined) || null) : undefined;
  const sentText = typeof data[slot.text] === "string" ? (data[slot.text] as string) : undefined;
  const contactsOfParty = async () => (partyId ? contactsOf(partyId) : []);

  const unchanged = (sentId === undefined || sentId === storedId) && (sentText === undefined || sentText.trim() === storedText.trim());
  if (existing && unchanged) {
    if (!partyChanged) {
      if (sentId !== undefined || sentText !== undefined) {
        data[slot.text] = storedText;
        data[slot.id] = storedId;
      }
      return;
    }
    if (storedId) {
      write(data, slot, (await contactsOfParty()).find((c) => c.id === storedId) ?? null);
    } else if (storedText.trim() && mode !== "free") {
      // A Customer's PIC stored by name only: it stays while the new customer has that contact.
      write(data, slot, contactNamed(storedText, await contactsOfParty()));
    } else if (sentText !== undefined) {
      data[slot.text] = storedText;
      data[slot.id] = null;
    }
    return;
  }
  if (!existing && sentId === undefined && sentText === undefined) return;

  if (sentId) {
    const contact = (await contactsOfParty()).find((c) => c.id === sentId);
    if (contact) return write(data, slot, contact);
    if (mode === "strict") throw refusal(slot, partyId);
    // Not a contact of the party (deleted since, or another party's): the name decides.
    if (sentText === undefined) {
      data[slot.id] = null;
      if (mode === "lenient") data[slot.text] = "";
      return;
    }
  } else if (sentText === undefined || !sentText.trim()) {
    // A blank name, or an id cleared on its own: nobody.
    return write(data, slot, null);
  }

  const contact = contactNamed(sentText, await contactsOfParty());
  if (contact) return write(data, slot, contact);
  if (mode === "free") {
    data[slot.id] = null;
    return;
  }
  if (mode === "lenient") return write(data, slot, null);
  throw refusal(slot, partyId);
}

// --- The links backfill ---

/** What the backfill reads of a live shipment. */
export interface ShipmentLinks {
  id: string;
  customerId: string | null;
  customer: string;
  shipperId: string | null;
  shipper: string;
  consigneeId: string | null;
  consignee: string;
  principalPartyId: string | null;
  principalParty: string;
  customerPic: string;
  customerPicContactId: string | null;
  shipperContact: string;
  shipperContactId: string | null;
  consigneeContact: string;
  consigneeContactId: string | null;
}

/** What the backfill reads of a live master job. */
export interface MasterJobLinks {
  id: string;
  shipperId: string | null;
  shipper: string;
  consigneeId: string | null;
  consignee: string;
}

/** One row's change: the values it is changed from (an edit made since the read wins) and to. */
export interface LinkRewrite<T> {
  id: string;
  from: Partial<T>;
  to: Partial<T>;
  /** How many values this changes (a party's name, a contact linked and/or renamed). */
  values: number;
}

export interface LinksPlan {
  checked: number;
  shipments: LinkRewrite<ShipmentLinks>[];
  masterJobs: LinkRewrite<MasterJobLinks>[];
  unmatched: UnmatchedLink[];
}

/** The Customer Database as the backfill sees it: live customers by id and their live contacts. */
export interface LinkRefs {
  customers: { id: string; companyName: string }[];
  contacts: (LinkContact & { customerId: string })[];
}

const SHIPMENT_PARTIES = [
  ["customerId", "customer"],
  ["shipperId", "shipper"],
  ["consigneeId", "consignee"],
  ["principalPartyId", "principalParty"],
] as const;
const MASTER_JOB_PARTIES = [
  ["shipperId", "shipper"],
  ["consigneeId", "consignee"],
] as const;

/** Every customer id the rows link to. */
export function linkedCustomerIds(shipments: ShipmentLinks[], masterJobs: MasterJobLinks[]): string[] {
  const ids = new Set<string>();
  for (const s of shipments) for (const [idKey] of SHIPMENT_PARTIES) if (s[idKey]) ids.add(s[idKey]!);
  for (const m of masterJobs) for (const [idKey] of MASTER_JOB_PARTIES) if (m[idKey]) ids.add(m[idKey]!);
  return [...ids];
}

/**
 * What the links backfill changes: a party linked to a customer takes the customer's current name;
 * a contact linked by id takes its current name; a contact stored by name only is linked to the
 * contact of its party that matchContact finds (and takes its name). A deleted customer or contact
 * leaves the copy as it is (a restore brings it back). A second run finds nothing to do.
 * Reported as unmatched is only what somebody can put right: a party linked to a customer that is
 * gone, and a Customer's PIC its live customer has no contact for. A contact of a party that is
 * no live customer has nothing to match (the party is what needs linking), and a Shipper /
 * Consignee Contact may be anybody - it is reported only when it fits several contacts.
 */
export function planLinksNormalize(shipments: ShipmentLinks[], masterJobs: MasterJobLinks[], refs: LinkRefs): LinksPlan {
  const names = new Map(refs.customers.map((c) => [c.id, c.companyName]));
  const contactsOf = new Map<string, LinkContact[]>();
  for (const c of refs.contacts) contactsOf.set(c.customerId, [...(contactsOf.get(c.customerId) ?? []), c]);
  const unmatched = new Map<string, UnmatchedLink>();
  const miss = (field: string, value: string) => {
    const key = `${field}\n${value}`;
    const entry = unmatched.get(key) ?? { field, value, count: 0 };
    entry.count++;
    unmatched.set(key, entry);
  };
  let checked = 0;

  const parties = <T extends { id: string }>(row: T, keys: readonly (readonly [keyof T, keyof T])[], rewrite: LinkRewrite<T>, prefix: string) => {
    for (const [idKey, textKey] of keys) {
      const id = row[idKey] as string | null;
      if (!id) continue;
      checked++;
      const name = names.get(id);
      const text = row[textKey] as string;
      if (name === undefined) miss(`${prefix}${String(textKey)}`, text);
      else if (name !== text) {
        rewrite.from[textKey] = row[textKey];
        rewrite.to[textKey] = name as T[keyof T];
        rewrite.values++;
      }
    }
  };

  const shipmentRewrites: LinkRewrite<ShipmentLinks>[] = [];
  for (const s of shipments) {
    const rewrite: LinkRewrite<ShipmentLinks> = { id: s.id, from: {}, to: {}, values: 0 };
    parties(s, SHIPMENT_PARTIES, rewrite, "");
    for (const slot of CONTACT_SLOTS) {
      const text = s[slot.text];
      const partyId = s[slot.party];
      const contacts = partyId ? (contactsOf.get(partyId) ?? []) : [];
      const linkedId = s[slot.id];
      if (linkedId) {
        checked++;
        const contact = contacts.find((c) => c.id === linkedId);
        if (contact && contact.name.trim() !== text) {
          Object.assign(rewrite.from, { [slot.text]: text });
          Object.assign(rewrite.to, { [slot.text]: contact.name.trim() });
          rewrite.values++;
        }
        continue;
      }
      if (!text.trim() || !partyId || !names.has(partyId)) continue;
      checked++;
      const contact = matchContact(text, contacts);
      if (!contact) {
        if (slot === CUSTOMER_PIC || startingWith(normaliseName(text), contacts).length > 1) miss(slot.text, text);
        continue;
      }
      Object.assign(rewrite.from, { [slot.id]: null, [slot.text]: text });
      Object.assign(rewrite.to, { [slot.id]: contact.id, [slot.text]: contact.name.trim() });
      rewrite.values++;
    }
    if (rewrite.values) shipmentRewrites.push(rewrite);
  }

  const masterJobRewrites: LinkRewrite<MasterJobLinks>[] = [];
  for (const m of masterJobs) {
    const rewrite: LinkRewrite<MasterJobLinks> = { id: m.id, from: {}, to: {}, values: 0 };
    parties(m, MASTER_JOB_PARTIES, rewrite, "masterJob.");
    if (rewrite.values) masterJobRewrites.push(rewrite);
  }

  return {
    checked,
    shipments: shipmentRewrites,
    masterJobs: masterJobRewrites,
    unmatched: [...unmatched.values()].sort((a, b) => b.count - a.count || a.field.localeCompare(b.field) || a.value.localeCompare(b.value)),
  };
}
