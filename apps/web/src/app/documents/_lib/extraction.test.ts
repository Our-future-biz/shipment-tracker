import { describe, expect, it } from "vitest";
import { containerNumbersOnFile, containersAfterReading, currencyOptions, currencyProblem, customerNamed, fieldName, keepsPartyLink, keptPartyDetails, mblContainers, mblDefaultTicks, mblToMasterJobUpdate, normalizeExtracted, partyLinks, readCurrency, sealNote, sealsOf, sealsOnFileThatDiffer, withMblSeals, type ShipmentPartyDetails } from "./extraction";

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

describe("Master B/L to master job", () => {
  // As read from an ACL data freight receipt (CHV229738): one 40' HC with its seal.
  const info = {
    "Master BoL Number": "SA01241241",
    "Shipping line / Coloader": "Atlantic Container Line",
    "Container Number": "ACLU9821217",
    "Seal Number": "SL123456",
    "CNTR count [1]": "1",
    "CNTR length [1]": "40HC",
    "CNTR type [1]": "DRY",
    "Cargo Closing": "2026-02-20",
  };

  it("files each container with its seal and type", () => {
    expect(mblContainers(info)).toEqual([{ containerNumber: "ACLU9821217", sealNumber: "SL123456", type: "40' HC", shipmentIds: [] }]);
  });

  it("pairs seals with containers in order, leaving a container without one empty", () => {
    const two = mblContainers({ "Container Number": "ACLU9821217, MSKU1234565", "Seal Number": ", S2" });
    expect(two.map((c) => [c.containerNumber, c.sealNumber])).toEqual([["ACLU9821217", ""], ["MSKU1234565", "S2"]]);
  });

  it("fills booking-confirmation fields of the master job from the MBL", () => {
    const ticks = mblDefaultTicks(info);
    expect(ticks["Seal Number"]).toBeUndefined(); // no tick of its own: it goes with the containers
    expect(mblToMasterJobUpdate(info, ticks)).toMatchObject({
      masterBolNumber: "SA01241241",
      shippingLine: "Atlantic Container Line",
      closingDate: "2026-02-20",
    });
  });
});

describe("seal numbers read with containers", () => {
  const A = "ACLU9821217";
  const B = "MSKU1234565";
  const line = (containerNumber: string, sealNumber = "") => ({ containerNumber, sealNumber, type: "40' HC", teu: "2", packages: "", packageType: "", grossWeight: "", volume: "" });

  it("pairs one seal per container, and leaves any other list unpaired", () => {
    expect(sealsOf([A, B], "S1, S2")).toEqual(["S1", "S2"]);
    expect(sealsOf([A, B], ", S2")).toEqual(["", "S2"]);
    expect(sealsOf([A, B], "S1")).toBeNull();
    expect(sealsOf([], "S1")).toBeNull();
  });

  it("pairs a single container with one seal only: a comma list for it is a count that doesn't match", () => {
    expect(sealsOf([A], "S1")).toEqual(["S1"]);
    // Several seals on one container are read as one value.
    expect(sealsOf([A], "S1 / S2")).toEqual(["S1 / S2"]);
    expect(sealsOf([A], "S1, S2")).toBeNull();
    expect(sealNote([A], "S1, S2")).toEqual({ text: expect.stringContaining("One container"), warn: true });
    expect(containersAfterReading([line(A, "OLD")], { numbers: A, addNumbers: true, seals: "S1, S2" })[0]!.sealNumber).toBe("OLD");
  });

  it("pairs seals with the shipment's numbered rows only, a row without a number left out alike everywhere", () => {
    const onFile = [line(""), line(A, "OLD")];
    expect(containerNumbersOnFile(onFile)).toEqual([A]);
    // One seal and one numbered container: it goes there, and the seal it replaces shows as on file.
    expect(containersAfterReading(onFile, { addNumbers: false, seals: "S1" }).map((c) => c.sealNumber)).toEqual(["", "S1"]);
    expect(sealsOnFileThatDiffer(onFile, undefined, "S1")).toBe("OLD");
  });

  it("warns when seals are paired with the shipment's rows by their order because the document names no container", () => {
    expect(sealNote([A, B], "S1, S2", { byRowOrder: true })).toEqual({ text: expect.stringContaining(`${A}: S1 · ${B}: S2`), warn: true });
    expect(sealNote([A, B], "S1, S2")).toEqual({ text: `${A}: S1 · ${B}: S2`, warn: false });
    // With one container on file there is no order to get wrong.
    expect(sealNote([A], "S1", { byRowOrder: true })).toEqual({ text: expect.stringContaining(A), warn: false });
  });

  it("adds containers with their seals on a new shipment", () => {
    const rows = containersAfterReading([], { numbers: `${A}, ${B}`, addNumbers: true, seals: "S1, S2" });
    expect(rows.map((c) => [c.containerNumber, c.sealNumber])).toEqual([[A, "S1"], [B, "S2"]]);
  });

  it("puts the seal on a container on file instead of adding it twice, keeping its other details", () => {
    const rows = containersAfterReading([line(A)], { numbers: A, addNumbers: true, seals: "S1" });
    expect(rows).toEqual([{ ...line(A), sealNumber: "S1" }]);
  });

  it("files a ticked seal without adding its unticked container", () => {
    const rows = containersAfterReading([line(A)], { numbers: `${A}, ${B}`, addNumbers: false, seals: "S1, S2" });
    expect(rows).toEqual([{ ...line(A), sealNumber: "S1" }]);
  });

  it("leaves seals on file alone when the seal row is not ticked", () => {
    const rows = containersAfterReading([line(A, "OLD")], { numbers: `${A}, ${B}`, addNumbers: true });
    expect(rows.map((c) => [c.containerNumber, c.sealNumber])).toEqual([[A, "OLD"], [B, ""]]);
  });

  it("puts a seal read without a container number on the shipment's only container", () => {
    expect(containersAfterReading([line(A)], { addNumbers: false, seals: "S1" })[0]!.sealNumber).toBe("S1");
    expect(containersAfterReading([line(A), line(B)], { addNumbers: false, seals: "S1" }).map((c) => c.sealNumber)).toEqual(["", ""]);
  });

  it("names only the seals on file that the reading would change", () => {
    const onFile = [line(A, "S1"), line(B)];
    expect(sealsOnFileThatDiffer(onFile, `${A}, ${B}`, "S1, S2")).toBe("");
    expect(sealsOnFileThatDiffer([line(A, "OLD"), line(B)], `${A}, ${B}`, "S1, S2")).toBe("OLD");
  });

  it("gives a House B/L without a seal the Master B/L's for the same container", () => {
    const mbl = { "Container Number": `${A}, ${B}`, "Seal Number": "S1, S2" };
    const house = { Shipper: "Acme", "Container Number": B, POL: "Hamburg" };
    const filled = withMblSeals(house, mbl);
    expect(filled["Seal Number"]).toBe("S2");
    expect(Object.keys(filled)).toEqual(["Shipper", "Container Number", "Seal Number", "POL"]);
    expect(withMblSeals({ ...house, "Seal Number": "OWN" }, mbl)["Seal Number"]).toBe("OWN");
    expect(withMblSeals({ "Container Number": "TCLU1234560" }, mbl)["Seal Number"]).toBeUndefined();
    expect(withMblSeals(house, null)).toBe(house);
  });

  it("says where each seal goes, or why it can't be filed", () => {
    expect(sealNote([A], "S1")).toBeNull();
    expect(sealNote([A, B], ", S2")).toEqual({ text: `${A}: no seal · ${B}: S2`, warn: false });
    expect(sealNote([A, B], "S1")?.warn).toBe(true);
    expect(sealNote([], "S1")?.warn).toBe(true);
  });

  it("does not file an MBL's seal on the wrong container when the list is short", () => {
    const two = mblContainers({ "Container Number": `${A}, ${B}`, "Seal Number": "S1" });
    expect(two.map((c) => c.sealNumber)).toEqual(["", ""]);
  });

  it("tidies a seal list and drops one with no seal in it", () => {
    expect(normalizeExtracted({ "Seal Number": "S1 ,S2" })["Seal Number"]).toBe("S1, S2");
    expect(normalizeExtracted({ "Seal Number": " , " })["Seal Number"]).toBeUndefined();
  });
});

describe("fieldName", () => {
  it("names the ports in full and keeps every other label as read", () => {
    expect(["POL", "POD", "Vessel"].map(fieldName)).toEqual(["Port of Loading", "Port of Discharge", "Vessel"]);
  });
});

describe("an invoice's currency", () => {
  it("is the code read, also one that isn't among the usual ones", () => {
    expect(readCurrency("PLN")).toBe("PLN");
    expect(readCurrency(" eur ")).toBe("EUR");
    expect(currencyProblem("PLN")).toBeNull();
  });

  it("is none, never CZK, when nothing or no code was read", () => {
    for (const raw of [undefined, "", " ", "€", "Kč", "EURO", "US$"]) expect(readCurrency(raw)).toBe("");
    expect(currencyProblem(undefined)).toBe("No currency was read: choose the currency.");
    expect(currencyProblem("€")).toBe('"€" is no currency code: choose the currency.');
  });

  it("is offered beside the usual ones when it is another", () => {
    expect(currencyOptions("PLN").map((o) => o.value)).toEqual(["CZK", "USD", "EUR", "GBP", "CHF", "CNY", "JPY", "PLN"]);
    expect(currencyOptions("EUR")).toHaveLength(7);
    expect(currencyOptions("")).toHaveLength(7);
  });
});
