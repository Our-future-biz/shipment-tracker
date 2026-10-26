import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { contactLinks, contactUpdate, copiedLinks, partyUpdate } from "./parties";

describe("contactLinks", () => {
  it("puts a contact's id under the field that keeps it", () => {
    expect(contactLinks("customerPic", "c1")).toEqual({ customerPicContactId: "c1" });
    expect(contactLinks("shipperContact", null)).toEqual({ shipperContactId: null });
    expect(contactLinks("consigneeContact", "c2")).toEqual({ consigneeContactId: "c2" });
  });

  it("has nothing for a field that names no contact", () => {
    expect(contactLinks("agentPic", "c1")).toBeUndefined();
  });
});

describe("contactUpdate", () => {
  it("writes the name and the id together", () => {
    expect(contactUpdate("shipperContact", "Petr Masák", "c1")).toEqual({ shipperContact: "Petr Masák", shipperContactId: "c1" });
    // Typed by hand: no id.
    expect(contactUpdate("consigneeContact", "Front desk", null)).toEqual({ consigneeContact: "Front desk", consigneeContactId: null });
  });
});

describe("partyUpdate", () => {
  it("writes a party's name with its customer id", () => {
    expect(partyUpdate("shipper", "Acme s.r.o.", "k1")).toEqual({ shipper: "Acme s.r.o.", shipperId: "k1" });
    expect(partyUpdate("principalParty", "Typed", null)).toEqual({ principalParty: "Typed", principalPartyId: null });
  });
});

describe("copiedLinks", () => {
  const source = {
    customerId: "k0",
    shipperId: "k1",
    consigneeId: null,
    principalPartyId: "k3",
    customerPicContactId: "c0",
    shipperContactId: "c1",
    consigneeContactId: null,
  } as interfaces.ShipmentItem;

  it("copies the link of each copied party and contact", () => {
    expect(copiedLinks(source, ["shipper", "consignee", "agent", "pol"])).toEqual({ shipperId: "k1" });
    expect(copiedLinks(source, ["customer", "customerPic", "principalParty", "shipperContact"])).toEqual({
      customerId: "k0",
      customerPicContactId: "c0",
      principalPartyId: "k3",
      shipperContactId: "c1",
    });
  });

  it("copies nothing for names that are not copied or not linked", () => {
    expect(copiedLinks(source, [])).toEqual({});
    expect(copiedLinks(source, ["consignee", "consigneeContact"])).toEqual({});
  });
});
