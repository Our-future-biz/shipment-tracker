import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { isConsigneeChange, partyContact, partyStop, stopKeys, type PartyAddress } from "../lib/partyAddress";

const address = (over: Partial<PartyAddress> = {}): PartyAddress => ({
  types: ["Pickup"],
  street: "V jámě",
  city: "Praha 6",
  postalCode: "160 00",
  country: "CZ",
  ...over,
});
const customer = (registeredAddress = "", country = "CZ") => ({ registeredAddress, country });
// What belonged to the party picked before: its site and hours.
const cleared = { siteId: null, openingFrom: "", openingTo: "" };

describe("stopKeys", () => {
  it("leaves the consignee's Delivery Phone and Delivery Notes out of its stop: they go with the consignee, not its address (Shipments review)", () => {
    expect(stopKeys("consignee")).toMatchObject({ address: "deliveryAddress", siteId: "deliverySiteId" });
    expect(Object.values(stopKeys("consignee"))).not.toContain("deliveryPhone");
    expect(Object.values(stopKeys("consignee"))).not.toContain("deliveryNotes");
  });
});

describe("partyStop", () => {
  const addresses = [
    address({ types: ["Registered"], street: "Jankovcova 1522/53", city: "Praha", postalCode: "170 00" }),
    address({ types: ["Pickup"] }),
    address({ types: ["Delivery"], street: "Dopravní", city: "Praha 11", postalCode: "18000" }),
  ];

  it("fills the shipper's pick-up from its Pickup address, the consignee's delivery from its Delivery address", () => {
    expect(partyStop("shipper", customer(), addresses)).toEqual({ address: "V jámě, Praha 6", postcode: "16000", country: "CZ", ...cleared });
    expect(partyStop("consignee", customer(), addresses)).toEqual({ address: "Dopravní, Praha 11", postcode: "18000", country: "CZ", ...cleared });
  });

  it("takes the first address of the type, skipping one with no street or city", () => {
    const two = [address({ street: "", city: "" }), address({ street: "První" }), address({ street: "Druhá" })];
    expect(partyStop("shipper", customer(), two)?.address).toBe("První, Praha 6");
  });

  it("falls back to the Registered address, then to the customer's registered address text", () => {
    expect(partyStop("shipper", customer(), [addresses[0]!, addresses[2]!])).toMatchObject({ address: "Jankovcova 1522/53, Praha", postcode: "17000" });
    expect(partyStop("consignee", customer("Na příkopě, 969/33, Praha, 110 00"), [address({ types: ["Billing"] })])).toEqual({
      address: "Na příkopě, 969/33, Praha, 110 00",
      postcode: "11000",
      country: "CZ",
      ...cleared,
    });
    expect(partyStop("shipper", customer("Hlavná 1, Bratislava, 811 01", "SK"), [])).toMatchObject({ postcode: "811 01", country: "SK" });
    expect(partyStop("shipper", customer("Hlavná 1, 811 01 Bratislava", "SK"), [])?.postcode).toBeNull();
  });

  it("gives nothing for a customer with no address", () => {
    expect(partyStop("shipper", customer("  "), [address({ types: ["Delivery"] })])).toBeNull();
  });

  it("gives an address with no country the customer's, and reads its postcode by that country's rule", () => {
    expect(partyStop("shipper", customer("", "DE"), [address({ country: "", postalCode: "10115" })])).toMatchObject({ country: "DE", postcode: "10115" });
    expect(partyStop("shipper", customer("", "de"), [address({ country: "", postalCode: "1100" })])).toMatchObject({ country: "DE", postcode: "1100" });
  });

  it("keeps a Czech postcode out when it is not five digits; a foreign one as typed", () => {
    expect(partyStop("shipper", customer(), [address({ postalCode: "1100" })])?.postcode).toBeNull();
    expect(partyStop("shipper", customer(), [address({ postalCode: " sw1a 1aa", country: "gb" })])).toMatchObject({ postcode: "SW1A 1AA", country: "GB" });
  });
});

// The Delivery Phone and Notes go with the consignee, not its Customer Database record (Shipments review).
describe("isConsigneeChange", () => {
  const A = "3c1e2f0a-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
  const B = "8d2e1f0a-5b6d-4e7f-8a9b-0c1d2e3f4a5d";

  it("reads two linked consignees by their record", () => {
    expect(isConsigneeChange({ consignee: "Alfa s.r.o.", consigneeId: B }, { consignee: "Alfa s.r.o.", consigneeId: A })).toBe(true);
    expect(isConsigneeChange({ consignee: "Alfa a.s.", consigneeId: A }, { consignee: "Alfa s.r.o.", consigneeId: A })).toBe(false);
  });

  it("reads a free-text one by its name, trimmed and in any case", () => {
    expect(isConsigneeChange({ consignee: "Beta s.r.o.", consigneeId: null }, { consignee: "Alfa s.r.o.", consigneeId: null })).toBe(true);
    expect(isConsigneeChange({ consignee: "Beta s.r.o." }, { consignee: "Alfa s.r.o.", consigneeId: null })).toBe(true);
    expect(isConsigneeChange({ consignee: " ALFA s.r.o. " }, { consignee: "Alfa s.r.o.", consigneeId: null })).toBe(false);
  });

  it("is no change to link a free-text consignee to its own record, or to unlink it", () => {
    expect(isConsigneeChange({ consignee: "Alfa s.r.o.", consigneeId: A }, { consignee: "Alfa s.r.o.", consigneeId: null })).toBe(false);
    expect(isConsigneeChange({ consigneeId: null }, { consignee: "Alfa s.r.o.", consigneeId: A })).toBe(false);
    expect(isConsigneeChange({ consignee: "Beta s.r.o.", consigneeId: A }, { consignee: "Alfa s.r.o.", consigneeId: null })).toBe(true);
  });

  it("is none for a write that names no consignee", () => {
    expect(isConsigneeChange({}, { consignee: "Alfa s.r.o.", consigneeId: A })).toBe(false);
  });
});

describe("partyContact", () => {
  const contact =(name: string, role: string, isMain = false) => ({ name, role, isMain });

  it("takes Customer Service, else the Logistics Manager, else anyone", () => {
    const all = [contact("Eva Sales", "Sales", true), contact("Petr Logistika", "Logistics Manager"), contact("Jana Servis", "Customer Service")];
    expect(partyContact(all)?.name).toBe("Jana Servis");
    expect(partyContact(all.slice(0, 2))?.name).toBe("Petr Logistika");
    expect(partyContact(all.slice(0, 1))?.name).toBe("Eva Sales");
  });

  it("prefers the main contact within a role, else keeps the order given", () => {
    expect(partyContact([contact("První", "Customer Service"), contact("Hlavní", "Customer Service", true)])?.name).toBe("Hlavní");
    expect(partyContact([contact("První", "Customer Service"), contact("Druhý", "Customer Service")])?.name).toBe("První");
    expect(partyContact([contact("Účetní", "Finance / Accounting"), contact("Hlavní", "Owner", true)])?.name).toBe("Hlavní");
  });

  it("hands over the contact itself, so its id is stored with its name", () => {
    const picked = { id: "c-2", name: "Jana Servis", role: "Customer Service", isMain: false };
    expect(partyContact([{ id: "c-1", name: "Eva Sales", role: "Sales", isMain: true }, picked])).toBe(picked);
  });

  it("gives nothing with no named contact", () => {
    expect(partyContact([])).toBeNull();
    expect(partyContact([contact("  ", "Customer Service")])).toBeNull();
  });
});
