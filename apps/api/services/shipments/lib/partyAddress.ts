// Picking a shipper or consignee from the Customer Database fills its stop from the customer's
// Addresses: the shipper's pick-up from a Pickup address, the consignee's delivery from a
// Delivery address - address, postcode / country - and its Contact from the customer's contacts.

export type Party = "shipper" | "consignee";

/** The parts of a Customer Database customer an address is read from. */
export interface PartyCustomer {
  registeredAddress: string;
  country: string;
}

/** The parts of a customer address (the Addresses tab) a stop is read from. */
export interface PartyAddress {
  type: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface StopFill {
  address: string;
  postcode: string | null;
  country: string | null;
  // The trucking site and opening hours belonged to the party picked before; they are cleared.
  siteId: null;
  openingFrom: "";
  openingTo: "";
}

const STOP_KEYS = {
  shipper: {
    address: "pickupAddress",
    postcode: "pickupPostcode",
    country: "pickupCountry",
    siteId: "pickupSiteId",
    openingFrom: "shipperOpeningFrom",
    openingTo: "shipperOpeningTo",
  },
  consignee: {
    address: "deliveryAddress",
    postcode: "deliveryPostcode",
    country: "deliveryCountry",
    siteId: "deliverySiteId",
    openingFrom: "consigneeOpeningFrom",
    openingTo: "consigneeOpeningTo",
  },
} as const;

/** The shipment fields of the stop a party fills, by what they hold. */
export const stopKeys = (party: Party) => STOP_KEYS[party];

const ADDRESS_TYPE: Record<Party, PartyAddress["type"]> = { shipper: "Pickup", consignee: "Delivery" };

/** A postcode as a shipment stores it: a Czech one as its five digits, null when it is not one. */
function storedPostcode(postcode: string, country: string): string | null {
  const value = postcode.trim().toUpperCase().replace(/\s+/g, " ");
  if (!value) return null;
  if (country !== "CZ") return value;
  const digits = value.replace(/\s/g, "");
  return /^\d{5}$/.test(digits) ? digits : null;
}

const fromAddress = (a: PartyAddress): StopFill | null => {
  const address = [a.street, a.city].map((p) => p.trim()).filter(Boolean).join(", ");
  if (!address) return null;
  const country = (a.country || "CZ").trim().toUpperCase();
  return { address, postcode: storedPostcode(a.postalCode, country), country, siteId: null, openingFrom: "", openingTo: "" };
};

/**
 * The stop a party fills: its first Pickup (shipper) or Delivery (consignee) address, else its
 * Registered address. Null when the customer has none, so nothing is overwritten.
 */
export function partyStop(party: Party, customer: PartyCustomer, addresses: readonly PartyAddress[]): StopFill | null {
  for (const type of [ADDRESS_TYPE[party], "Registered"] as const) {
    for (const a of addresses.filter((x) => x.type === type)) {
      const stop = fromAddress(a);
      if (stop) return stop;
    }
  }
  // A customer from before the Addresses tab keeps its seat as one text, ending with its
  // postcode ("Na příkopě, 969/33, Praha, 11000"); a last part that is more than a postcode
  // ("811 01 Bratislava") is not taken.
  const address = customer.registeredAddress.trim();
  if (!address) return null;
  const country = (customer.country || "CZ").trim().toUpperCase();
  const last = address.includes(",") ? address.split(",").pop()!.trim() : "";
  const postcode = /\d/.test(last) && /^[A-Z0-9][A-Z0-9 -]{2,9}$/i.test(last) ? storedPostcode(last, country) : null;
  return { address, postcode, country, siteId: null, openingFrom: "", openingTo: "" };
}

/** The parts of a customer contact the shipment's Contact is chosen by. */
export interface PartyContact {
  name: string;
  role: string;
  isMain: boolean;
}

// Who a shipment's Contact is, by role: Customer Service, else the Logistics Manager, else anyone.
const CONTACT_ROLES = ["Customer Service", "Logistics Manager"];

/** The name of the contact a party's Contact is filled with; the main one first within a role. Null with none. */
export function partyContact(contacts: readonly PartyContact[]): string | null {
  const named = contacts.filter((c) => c.name.trim());
  const rank = (c: PartyContact) => {
    const role = CONTACT_ROLES.indexOf(c.role);
    return (role < 0 ? CONTACT_ROLES.length : role) * 2 + (c.isMain ? 0 : 1);
  };
  // A stable sort keeps the order the Customer Database gives within one rank.
  const best = [...named].sort((a, b) => rank(a) - rank(b))[0];
  return best ? best.name.trim() : null;
}
