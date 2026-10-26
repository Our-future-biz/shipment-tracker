import { describe, expect, it } from "vitest";
import { customerNamed, keepsPartyLink, keptPartyDetails, partyLinks, type ShipmentPartyDetails } from "./extraction";

const acme = { id: "k1", companyName: "Acme Logistics s.r.o." };
const zelezny = { id: "k2", companyName: "Železný a syn" };

describe("customerNamed", () => {
  it("finds the one customer of that exact name, case, diacritics and spacing aside", () => {
    expect(customerNamed("ACME  LOGISTICS S.R.O.", [acme, zelezny])).toBe(acme);
    expect(customerNamed("zelezny a syn", [acme, zelezny])).toBe(zelezny);
  });

  it("finds nobody for a partial name, an empty one or two customers of that name", () => {
    expect(customerNamed("Acme", [acme])).toBeNull();
    expect(customerNamed(" ", [acme])).toBeNull();
    expect(customerNamed("Acme Logistics s.r.o.", [acme, { ...acme, id: "k9" }])).toBeNull();
  });
});

describe("partyLinks", () => {
  const linked = { shipper: "Acme Logistics s.r.o.", shipperId: "k1", consignee: "Typed Consignee", consigneeId: null };

  it("keeps the link of a name that is the linked customer's", () => {
    expect(keepsPartyLink("shipper", "acme logistics s.r.o.", linked)).toBe(true);
    expect(partyLinks({ shipper: "acme logistics s.r.o." }, linked, {})).toEqual({ shipperId: "k1" });
  });

  it("unlinks a linked party given another company's name", () => {
    expect(partyLinks({ shipper: "Other Shipper Ltd" }, linked, { shipper: null })).toEqual({ shipperId: null });
  });

  it("links a name that is a customer's in the Customer Database", () => {
    expect(partyLinks({ shipper: "Železný a syn" }, linked, { shipper: zelezny })).toEqual({ shipperId: "k2" });
    expect(partyLinks({ consignee: "Železný a syn" }, linked, { consignee: zelezny })).toEqual({ consigneeId: "k2" });
    // A new shipment: nothing to keep or unlink.
    expect(partyLinks({ shipper: "Železný a syn", consignee: "Nobody" }, undefined, { shipper: zelezny, consignee: null })).toEqual({ shipperId: "k2" });
  });

  it("leaves an unlinked party unlinked and a party not written alone", () => {
    expect(partyLinks({ consignee: "Another Typed Name" }, linked, {})).toEqual({});
    expect(partyLinks({}, linked, {})).toEqual({});
    expect(partyLinks({ shipper: "  " }, linked, {})).toEqual({});
  });
});

describe("keptPartyDetails", () => {
  // An existing shipment: a typed shipper with a hand-typed pick-up, a linked consignee with a linked Contact.
  const shipment: ShipmentPartyDetails = {
    shipper: "Acme",
    shipperId: null,
    pickupAddress: "Skladová 1, Praha",
    pickupPostcode: "11000",
    pickupCountry: "CZ",
    pickupSiteId: null,
    shipperOpeningFrom: "08:00",
    shipperOpeningTo: "16:00",
    shipperContact: "Jana Nováková",
    shipperContactId: null,
    consignee: "Železný a syn",
    consigneeId: "k2",
    deliveryAddress: "",
    deliveryPostcode: null,
    deliveryCountry: null,
    deliverySiteId: null,
    consigneeOpeningFrom: "",
    consigneeOpeningTo: "",
    consigneeContact: "Petr Masák",
    consigneeContactId: "c7",
  };

  it("keeps the stop's address and the Contact as text when a document links the party to a customer", () => {
    const links = partyLinks({ shipper: "ACME Logistics s.r.o." }, shipment, { shipper: acme });
    expect(links).toEqual({ shipperId: "k1" });
    expect(keptPartyDetails(links, shipment)).toEqual({ pickupAddress: "Skladová 1, Praha", shipperContact: "Jana Nováková", shipperContactId: null });
  });

  it("keeps a linked Contact as text, and the stop untouched, when a document unlinks the party", () => {
    const links = partyLinks({ consignee: "Zelezny a syn s.r.o" }, shipment, { consignee: null });
    expect(links).toEqual({ consigneeId: null });
    expect(keptPartyDetails(links, shipment)).toEqual({ consigneeContact: "Petr Masák", consigneeContactId: null });
  });

  it("keeps a stop without an address by what else it holds", () => {
    const noAddress = { ...shipment, pickupAddress: "", pickupSiteId: "5f0c2b8e-1111-4c3a-9d1e-000000000001", shipperContact: "" };
    expect(keptPartyDetails({ shipperId: "k1" }, noAddress)).toEqual({
      pickupSiteId: "5f0c2b8e-1111-4c3a-9d1e-000000000001",
      pickupPostcode: "11000",
      pickupCountry: "CZ",
      shipperOpeningFrom: "08:00",
      shipperOpeningTo: "16:00",
    });
  });

  it("leaves an empty stop and Contact to the server to fill (a new shipment)", () => {
    const fresh: ShipmentPartyDetails = { shipper: "", shipperId: null, pickupAddress: "", pickupPostcode: null, shipperContact: "", shipperContactId: null };
    expect(keptPartyDetails({ shipperId: "k1" }, fresh)).toEqual({});
    expect(keptPartyDetails({ shipperId: "k1" }, undefined)).toEqual({});
  });

  it("adds nothing when the link stays as it is or the party is not written", () => {
    expect(keptPartyDetails({ consigneeId: "k2" }, shipment)).toEqual({});
    expect(keptPartyDetails({}, shipment)).toEqual({});
  });
});
