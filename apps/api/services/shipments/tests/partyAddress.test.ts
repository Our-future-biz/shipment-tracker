import { describe, expect, it } from "vitest";
import { partyStop, type PartyAddress } from "../lib/partyAddress";

const address = (over: Partial<PartyAddress> = {}): PartyAddress => ({
  type: "Pickup",
  street: "V jámě",
  city: "Praha 6",
  postalCode: "160 00",
  country: "CZ",
  ...over,
});
const customer = (registeredAddress = "", country = "CZ") => ({ registeredAddress, country });
const cleared = { siteId: null, openingFrom: "", openingTo: "" };

describe("partyStop", () => {
  const addresses = [
    address({ type: "Registered", street: "Jankovcova 1522/53", city: "Praha", postalCode: "170 00" }),
    address({ type: "Pickup" }),
    address({ type: "Delivery", street: "Dopravní", city: "Praha 11", postalCode: "18000" }),
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
    expect(partyStop("consignee", customer("Na příkopě, 969/33, Praha, 110 00"), [address({ type: "Billing" })])).toEqual({
      address: "Na příkopě, 969/33, Praha, 110 00",
      postcode: "11000",
      country: "CZ",
      ...cleared,
    });
    expect(partyStop("shipper", customer("Hlavná 1, Bratislava, 811 01", "SK"), [])).toMatchObject({ postcode: "811 01", country: "SK" });
    expect(partyStop("shipper", customer("Hlavná 1, 811 01 Bratislava", "SK"), [])?.postcode).toBeNull();
  });

  it("gives nothing for a customer with no address", () => {
    expect(partyStop("shipper", customer("  "), [address({ type: "Delivery" })])).toBeNull();
  });

  it("keeps a Czech postcode out when it is not five digits; a foreign one as typed", () => {
    expect(partyStop("shipper", customer(), [address({ postalCode: "1100" })])?.postcode).toBeNull();
    expect(partyStop("shipper", customer(), [address({ postalCode: " sw1a 1aa", country: "gb" })])).toMatchObject({ postcode: "SW1A 1AA", country: "GB" });
  });
});
