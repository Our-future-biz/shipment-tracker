import { describe, expect, it } from "vitest";
import { contactNamed, findContact } from "./useCustomerContacts";

const petr = { id: "c1", name: "Petr Masák" };
const jana = { id: "c2", name: "Jana Nová" };
const contacts = [petr, jana];

describe("findContact", () => {
  it("finds the contact by the id the shipment keeps, whatever name it stores", () => {
    // Renamed in the Customer Database (Petr -> Petr Masák) before the shipment's copy caught up.
    expect(findContact(contacts, "c1", "Petr")).toBe(petr);
  });

  it("finds an old value stored without an id by its name, in any case", () => {
    expect(findContact(contacts, null, " jana nová ")).toBe(jana);
    expect(findContact(contacts, undefined, "Petr")).toBeUndefined();
  });

  it("falls back to the name when the id names no contact (deleted since)", () => {
    expect(findContact(contacts, "gone", "Jana Nová")).toBe(jana);
    expect(findContact(contacts, "gone", "Somebody")).toBeUndefined();
  });

  it("finds nobody for no id and no name", () => {
    expect(findContact(contacts, null, "")).toBeUndefined();
    expect(findContact(contacts, "", null)).toBeUndefined();
  });
});

describe("contactNamed", () => {
  it("matches the exact name only, ignoring case and outer spaces", () => {
    expect(contactNamed(contacts, "PETR MASÁK ")).toBe(petr);
    expect(contactNamed(contacts, "Petr")).toBeUndefined();
    expect(contactNamed(contacts, "  ")).toBeUndefined();
  });
});
