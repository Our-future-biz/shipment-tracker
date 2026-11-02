import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { addressPostcode } from "./collectionQuote";
import { quoteAddressOptions, quoteAddressText } from "./quoteAddress";

const address = (over: Partial<interfaces.AddressItem>): interfaces.AddressItem => ({
  id: "a1",
  customerId: "c1",
  types: ["Pickup"],
  label: "Alza (nakladka)",
  street: "V jame",
  city: "Praha 6",
  postalCode: "16000",
  country: "CZ",
  createdAt: "",
  updatedAt: "",
  ...over,
});

describe("a Customer Database address on a quote", () => {
  it("reads as name, street, postcode and city, and country", () => {
    expect(quoteAddressText(address({}))).toBe("Alza (nakladka), V jame, 16000 Praha 6, Czechia");
    expect(quoteAddressText(address({ label: "", street: " Jankovcova 1522/53 ", postalCode: "170 00", city: "Praha" }))).toBe("Jankovcova 1522/53, 170 00 Praha, Czechia");
  });

  it("keeps the postcode the collections tariffs read", () => {
    expect(addressPostcode(quoteAddressText(address({})))).toBe("160 00");
    expect(addressPostcode(quoteAddressText(address({ street: "Jankovcova 1522/53", postalCode: "170 00" })))).toBe("170 00");
  });

  it("offers the customer's addresses of the field's type only, each once", () => {
    const list = [
      address({ id: "1" }),
      address({ id: "2", types: ["Delivery"], label: "Alza (vykladka)", street: "Dopravni", city: "Praha 11", postalCode: "18000" }),
      address({ id: "3", types: ["Registered"], label: "" }),
      address({ id: "4" }),
    ];
    expect(quoteAddressOptions(list, "Pickup")).toEqual([{ value: "Alza (nakladka), V jame, 16000 Praha 6, Czechia", label: "Alza (nakladka), V jame, 16000 Praha 6, Czechia" }]);
    expect(quoteAddressOptions(list, "Delivery").map((o) => o.value)).toEqual(["Alza (vykladka), Dopravni, 18000 Praha 11, Czechia"]);
  });

  it("offers an address that is several types in each of its fields", () => {
    const everything = address({ types: ["Registered", "Billing", "Pickup", "Delivery"], label: "", street: "Jankovcova 1522/53", city: "Praha", postalCode: "170 00" });
    const text = "Jankovcova 1522/53, 170 00 Praha, Czechia";
    expect(quoteAddressOptions([everything], "Pickup").map((o) => o.value)).toEqual([text]);
    expect(quoteAddressOptions([everything], "Delivery").map((o) => o.value)).toEqual([text]);
  });
});
