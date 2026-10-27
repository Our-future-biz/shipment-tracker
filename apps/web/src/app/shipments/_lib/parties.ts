import type { controllers, interfaces } from "@/lib/api/client";

/** Shipment fields holding a party name, each with the CRM customer id it links to. */
export type PartyField = "customer" | "shipper" | "consignee" | "principalParty";

/** The field that keeps the Customer Database id of each party name. */
export const PARTY_ID_FIELD = {
  customer: "customerId",
  shipper: "shipperId",
  consignee: "consigneeId",
  principalParty: "principalPartyId",
} as const satisfies Record<PartyField, keyof interfaces.ShipmentItem>;

/** Shipment fields holding a contact person's name, each with the field that keeps the contact's id. */
export const CONTACT_ID_FIELD = {
  customerPic: "customerPicContactId",
  shipperContact: "shipperContactId",
  consigneeContact: "consigneeContactId",
} as const satisfies Record<string, keyof interfaces.ShipmentItem>;
export type ContactField = keyof typeof CONTACT_ID_FIELD;

/** A contact's id, written together with its name. */
export type ContactLinks = Pick<controllers.ShipmentUpdateRequest, (typeof CONTACT_ID_FIELD)[ContactField]>;

/** The update that sets a party's name and its customer link together. */
export function partyUpdate(party: PartyField, name: string, customerId: string | null): controllers.ShipmentUpdateRequest {
  switch (party) {
    case "customer":
      return { customer: name, customerId };
    case "shipper":
      return { shipper: name, shipperId: customerId };
    case "consignee":
      return { consignee: name, consigneeId: customerId };
    case "principalParty":
      return { principalParty: name, principalPartyId: customerId };
  }
}

const isPartyField = (field: string): field is PartyField => field in PARTY_ID_FIELD;
const isContactField = (field: string): field is ContactField => field in CONTACT_ID_FIELD;

/** The contact id that goes with a name written to `field`; nothing for a field that names no contact. */
export function contactLinks(field: string, contactId: string | null): ContactLinks | undefined {
  return isContactField(field) ? { [CONTACT_ID_FIELD[field]]: contactId } : undefined;
}

/** The update that sets a contact's name and its id together (null for a name typed by hand). */
export function contactUpdate(field: ContactField, name: string, contactId: string | null): controllers.ShipmentUpdateRequest {
  return { [field]: name, [CONTACT_ID_FIELD[field]]: contactId };
}

/**
 * The links of the names copied from another shipment ("Copy from shipment"): each copied party's
 * customer and each copied contact's id, so the copy names the same records and follows their
 * renames. A name the source keeps without a link is copied as text only.
 */
export function copiedLinks(source: interfaces.ShipmentItem, copiedFields: Iterable<string>): Partial<controllers.ShipmentCreateRequest> {
  const out: Record<string, string> = {};
  for (const field of copiedFields) {
    const idField = isPartyField(field) ? PARTY_ID_FIELD[field] : isContactField(field) ? CONTACT_ID_FIELD[field] : null;
    const id = idField ? source[idField] : null;
    if (idField && id) out[idField] = id;
  }
  return out;
}
