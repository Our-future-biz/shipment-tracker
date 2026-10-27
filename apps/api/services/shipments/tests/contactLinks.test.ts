import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import {
  CONSIGNEE_CONTACT,
  CUSTOMER_PIC,
  SHIPPER_CONTACT,
  contactNamed,
  linkContact,
  linkedCustomerIds,
  matchContact,
  planLinksNormalize,
  type LinkContact,
  type MasterJobLinks,
  type ShipmentLinks,
} from "../lib/contactLinks";

const ALFA = "00000000-0000-0000-0000-0000000000a1";
const BETA = "00000000-0000-0000-0000-0000000000b2";
const PETR = { id: "00000000-0000-0000-0000-00000000c001", name: "Petr Masák" };
const JANA = { id: "00000000-0000-0000-0000-00000000c002", name: "Jana Malá" };
const EVA = { id: "00000000-0000-0000-0000-00000000c003", name: "Eva Nová" };
/** The contacts of each customer, as the Customer Database answers. */
const BOOK: Record<string, LinkContact[]> = { [ALFA]: [PETR, JANA], [BETA]: [EVA] };

const contactsOf = vi.fn(async (customerId: string) => BOOK[customerId] ?? []);

describe("contactNamed", () => {
  it("finds the contact by its exact name in any case, around spaces", () => {
    expect(contactNamed(" petr masák ", [PETR, JANA])).toBe(PETR);
    expect(contactNamed("Petr", [PETR, JANA])).toBeNull();
    expect(contactNamed("", [PETR])).toBeNull();
  });
});

describe("matchContact (the backfill's rules)", () => {
  it("takes the same name without regard to case or diacritics", () => {
    expect(matchContact("PETR MASAK", [PETR, JANA])).toBe(PETR);
    expect(matchContact("  jana   mala ", [PETR, JANA])).toBe(JANA);
  });

  it("prefers the main contact when two share the name", () => {
    const twin = { id: "twin", name: "Petr Masák", isMain: true };
    expect(matchContact("Petr Masák", [PETR, twin])).toBe(twin);
  });

  it("takes the only contact whose name starts with the stored text as whole words", () => {
    expect(matchContact("Petr", [PETR, JANA])).toBe(PETR);
    expect(matchContact("petr", [PETR, JANA])).toBe(PETR);
  });

  it("finds nobody for part of a word, for a first name two contacts share, or for nothing", () => {
    expect(matchContact("Pet", [PETR])).toBeNull();
    expect(matchContact("Petr", [PETR, { id: "x", name: "Petr Novák" }])).toBeNull();
    expect(matchContact("Karel", [PETR, JANA])).toBeNull();
    expect(matchContact(" ", [PETR])).toBeNull();
  });
});

describe("linkContact", () => {
  const link = (data: Record<string, unknown>, existing: Record<string, unknown> | undefined, slot = CUSTOMER_PIC, mode: "strict" | "lenient" | "free" = "strict") =>
    linkContact(data, existing, slot, contactsOf, mode).then(() => data);

  describe("Customer's PIC", () => {
    it("stores a contact sent by id with its current name", async () => {
      await expect(link({ customerPicContactId: PETR.id, customerPic: "Petr" }, { customerId: ALFA, customerPic: "", customerPicContactId: null })).resolves.toMatchObject({
        customerPic: "Petr Masák",
        customerPicContactId: PETR.id,
      });
    });

    it("refuses an id that is no contact of the customer - another customer's contact too", async () => {
      await expect(link({ customerPicContactId: EVA.id }, { customerId: ALFA, customerPic: "", customerPicContactId: null })).rejects.toMatchObject({
        code: "invalid_argument",
        message: "Customer's PIC: pick a contact saved for this customer in the Customer Database",
      });
      await expect(link({ customerPicContactId: EVA.id }, { customerId: null, customerPic: "", customerPicContactId: null })).rejects.toMatchObject({
        message: expect.stringContaining("link the shipment to a customer first"),
      });
    });

    it("checks against the customer of the same write", async () => {
      await expect(link({ customerId: BETA, customerPicContactId: EVA.id }, { customerId: ALFA, customerPic: "Petr Masák", customerPicContactId: PETR.id })).resolves.toMatchObject({
        customerPic: "Eva Nová",
        customerPicContactId: EVA.id,
      });
    });

    it("links a name sent alone to the contact it names", async () => {
      await expect(link({ customerPic: "jana malá" }, { customerId: ALFA, customerPic: "", customerPicContactId: null })).resolves.toEqual({
        customerPic: "Jana Malá",
        customerPicContactId: JANA.id,
      });
    });

    it("clears name and id together", async () => {
      const linked = { customerId: ALFA, customerPic: "Petr Masák", customerPicContactId: PETR.id };
      await expect(link({ customerPic: "" }, linked)).resolves.toEqual({ customerPic: "", customerPicContactId: null });
      await expect(link({ customerPicContactId: null }, linked)).resolves.toEqual({ customerPic: "", customerPicContactId: null });
    });

    it("passes what the shipment holds without asking the Customer Database - an old name without an id too", async () => {
      contactsOf.mockClear();
      await expect(link({ customerPic: "Petr" }, { customerId: ALFA, customerPic: "Petr", customerPicContactId: null })).resolves.toEqual({ customerPic: "Petr", customerPicContactId: null });
      await expect(link({ customerPic: "Petr Masák ", customerPicContactId: PETR.id }, { customerId: ALFA, customerPic: "Petr Masák", customerPicContactId: PETR.id })).resolves.toEqual({
        customerPic: "Petr Masák",
        customerPicContactId: PETR.id,
      });
      expect(contactsOf).not.toHaveBeenCalled();
    });

    it("takes the contact by its id when the name sent with it is out of date", async () => {
      await expect(link({ customerPic: "Petr", customerPicContactId: PETR.id }, { customerId: ALFA, customerPic: "Jana Malá", customerPicContactId: JANA.id })).resolves.toEqual({
        customerPic: "Petr Masák",
        customerPicContactId: PETR.id,
      });
    });

    it("on another customer, clears a PIC that is no contact of the new one", async () => {
      const onAlfa = { customerId: ALFA, customerPic: "Petr Masák", customerPicContactId: PETR.id };
      await expect(link({ customerId: BETA }, onAlfa)).resolves.toEqual({ customerId: BETA, customerPic: "", customerPicContactId: null });
      await expect(link({ customerId: null }, onAlfa)).resolves.toEqual({ customerId: null, customerPic: "", customerPicContactId: null });
      // Also when the write sends the old PIC along with the new customer.
      await expect(link({ customerId: BETA, customerPic: "Petr Masák" }, onAlfa)).resolves.toMatchObject({ customerPic: "", customerPicContactId: null });
      // An old name without an id goes the same way.
      await expect(link({ customerId: BETA }, { customerId: ALFA, customerPic: "Petr", customerPicContactId: null })).resolves.toMatchObject({ customerPic: "", customerPicContactId: null });
    });

    it("on another customer, keeps a PIC that is a contact of the new one too", async () => {
      const shared: Record<string, LinkContact[]> = { [BETA]: [EVA, PETR] };
      const of = async (id: string) => shared[id] ?? BOOK[id] ?? [];
      const data: Record<string, unknown> = { customerId: BETA };
      await linkContact(data, { customerId: ALFA, customerPic: "Petr", customerPicContactId: PETR.id }, CUSTOMER_PIC, of, "strict");
      expect(data).toEqual({ customerId: BETA, customerPic: "Petr Masák", customerPicContactId: PETR.id });
    });

    it("leaves the PIC alone when the customer stays", async () => {
      await expect(link({ customerId: ALFA, pol: "Hamburg" }, { customerId: ALFA, customerPic: "Petr Masák", customerPicContactId: PETR.id })).resolves.toEqual({ customerId: ALFA, pol: "Hamburg" });
    });

    it("on create, leaves out a name or an id that is no contact instead of refusing it", async () => {
      await expect(link({ customerId: ALFA, customerPic: "Somebody" }, undefined, CUSTOMER_PIC, "lenient")).resolves.toMatchObject({ customerPic: "", customerPicContactId: null });
      await expect(link({ customerId: ALFA, customerPicContactId: EVA.id }, undefined, CUSTOMER_PIC, "lenient")).resolves.toMatchObject({ customerPic: "", customerPicContactId: null });
      // An id no longer valid gives way to the name sent with it.
      await expect(link({ customerId: ALFA, customerPicContactId: EVA.id, customerPic: "Jana Malá" }, undefined, CUSTOMER_PIC, "lenient")).resolves.toMatchObject({
        customerPic: "Jana Malá",
        customerPicContactId: JANA.id,
      });
      await expect(link({ customerId: ALFA }, undefined, CUSTOMER_PIC, "lenient")).resolves.toEqual({ customerId: ALFA });
    });
  });

  describe("Shipper / Consignee Contact", () => {
    it("links a name of one of the party's contacts, and keeps any other name as typed, with no id", async () => {
      await expect(link({ shipperContact: "petr masák" }, { shipperId: ALFA, shipperContact: "", shipperContactId: null }, SHIPPER_CONTACT, "free")).resolves.toEqual({
        shipperContact: "Petr Masák",
        shipperContactId: PETR.id,
      });
      await expect(link({ shipperContact: "Somebody at the gate" }, { shipperId: ALFA, shipperContact: "Petr Masák", shipperContactId: PETR.id }, SHIPPER_CONTACT, "free")).resolves.toEqual({
        shipperContact: "Somebody at the gate",
        shipperContactId: null,
      });
      await expect(link({ consigneeContact: "Anyone" }, { consigneeId: null, consigneeContact: "", consigneeContactId: null }, CONSIGNEE_CONTACT, "free")).resolves.toEqual({
        consigneeContact: "Anyone",
        consigneeContactId: null,
      });
    });

    it("stores an id of the party's contact with its name, and drops one that is not", async () => {
      await expect(link({ consigneeContactId: EVA.id }, { consigneeId: BETA, consigneeContact: "", consigneeContactId: null }, CONSIGNEE_CONTACT, "free")).resolves.toEqual({
        consigneeContact: "Eva Nová",
        consigneeContactId: EVA.id,
      });
      await expect(link({ consigneeContactId: PETR.id, consigneeContact: "Petr M." }, { consigneeId: BETA, consigneeContact: "", consigneeContactId: null }, CONSIGNEE_CONTACT, "free")).resolves.toEqual({
        consigneeContact: "Petr M.",
        consigneeContactId: null,
      });
    });

    it("on another party, clears a linked contact that is not the new party's, and keeps a typed one", async () => {
      await expect(link({ shipperId: BETA }, { shipperId: ALFA, shipperContact: "Petr Masák", shipperContactId: PETR.id }, SHIPPER_CONTACT, "free")).resolves.toEqual({
        shipperId: BETA,
        shipperContact: "",
        shipperContactId: null,
      });
      await expect(link({ shipperId: null }, { shipperId: ALFA, shipperContact: "Petr Masák", shipperContactId: PETR.id }, SHIPPER_CONTACT, "free")).resolves.toMatchObject({
        shipperContact: "",
        shipperContactId: null,
      });
      await expect(link({ shipperId: BETA }, { shipperId: ALFA, shipperContact: "Typed Person", shipperContactId: null }, SHIPPER_CONTACT, "free")).resolves.toEqual({ shipperId: BETA });
    });
  });
});

describe("planLinksNormalize", () => {
  const shipment = (over: Partial<ShipmentLinks> = {}): ShipmentLinks => ({
    id: "s-1",
    customerId: null,
    customer: "",
    shipperId: null,
    shipper: "",
    consigneeId: null,
    consignee: "",
    principalPartyId: null,
    principalParty: "",
    customerPic: "",
    customerPicContactId: null,
    shipperContact: "",
    shipperContactId: null,
    consigneeContact: "",
    consigneeContactId: null,
    ...over,
  });
  const masterJob = (over: Partial<MasterJobLinks> = {}): MasterJobLinks => ({ id: "m-1", shipperId: null, shipper: "", consigneeId: null, consignee: "", ...over });
  const refs = {
    customers: [
      { id: ALFA, companyName: "Alfa s.r.o." },
      { id: BETA, companyName: "Beta a.s." },
    ],
    contacts: [
      { ...PETR, customerId: ALFA },
      { ...JANA, customerId: ALFA },
      { ...EVA, customerId: BETA },
    ],
  };

  it("brings the names of linked parties up to date, on shipments and master jobs", () => {
    const plan = planLinksNormalize(
      [shipment({ customerId: ALFA, customer: "Alfa sro", shipperId: BETA, shipper: "Beta a.s.", principalPartyId: ALFA, principalParty: "ALFA" })],
      [masterJob({ consigneeId: BETA, consignee: "Beta" })],
      refs,
    );
    expect(plan.shipments).toEqual([{ id: "s-1", from: { customer: "Alfa sro", principalParty: "ALFA" }, to: { customer: "Alfa s.r.o.", principalParty: "Alfa s.r.o." }, values: 2 }]);
    expect(plan.masterJobs).toEqual([{ id: "m-1", from: { consignee: "Beta" }, to: { consignee: "Beta a.s." }, values: 1 }]);
    expect(plan.checked).toBe(4);
    expect(plan.unmatched).toEqual([]);
  });

  it("links a contact stored by name to the contact of its party, and takes the contact's name", () => {
    const plan = planLinksNormalize(
      [shipment({ customerId: ALFA, customer: "Alfa s.r.o.", customerPic: "Petr", shipperId: BETA, shipper: "Beta a.s.", shipperContact: "eva nova", consigneeId: ALFA, consignee: "Alfa s.r.o.", consigneeContact: "Jana Malá" })],
      [],
      refs,
    );
    expect(plan.shipments).toEqual([
      {
        id: "s-1",
        from: { customerPicContactId: null, customerPic: "Petr", shipperContactId: null, shipperContact: "eva nova", consigneeContactId: null, consigneeContact: "Jana Malá" },
        to: { customerPicContactId: PETR.id, customerPic: "Petr Masák", shipperContactId: EVA.id, shipperContact: "Eva Nová", consigneeContactId: JANA.id, consigneeContact: "Jana Malá" },
        values: 3,
      },
    ]);
  });

  it("renames a contact linked by id, and leaves one that is gone as it is", () => {
    const plan = planLinksNormalize(
      [
        shipment({ id: "s-1", customerId: ALFA, customer: "Alfa s.r.o.", customerPic: "Petr", customerPicContactId: PETR.id }),
        shipment({ id: "s-2", customerId: ALFA, customer: "Alfa s.r.o.", customerPic: "Karel", customerPicContactId: "00000000-0000-0000-0000-00000000dead" }),
      ],
      [],
      refs,
    );
    expect(plan.shipments).toEqual([{ id: "s-1", from: { customerPic: "Petr" }, to: { customerPic: "Petr Masák" }, values: 1 }]);
    expect(plan.unmatched).toEqual([]);
  });

  it("matches a Customer's PIC against the shipment's customer only, and reports what finds nobody, most frequent first", () => {
    const plan = planLinksNormalize(
      [
        // Eva is a contact of Beta, not of this shipment's customer.
        shipment({ id: "s-1", customerId: ALFA, customer: "Alfa s.r.o.", customerPic: "Eva Nová" }),
        shipment({ id: "s-2", customerId: ALFA, customer: "Alfa s.r.o.", customerPic: "Eva Nová" }),
        // A customer that is gone keeps its name, reported.
        shipment({ id: "s-5", consigneeId: "00000000-0000-0000-0000-0000000000ff", consignee: "Gone Ltd" }),
      ],
      [masterJob({ shipperId: "00000000-0000-0000-0000-0000000000ff", shipper: "Gone Ltd" })],
      refs,
    );
    expect(plan.shipments).toEqual([]);
    expect(plan.masterJobs).toEqual([]);
    expect(plan.unmatched).toEqual([
      { field: "customerPic", value: "Eva Nová", count: 2 },
      { field: "consignee", value: "Gone Ltd", count: 1 },
      { field: "masterJob.shipper", value: "Gone Ltd", count: 1 },
    ]);
  });

  it("reports nothing nobody could put right: a contact of a party that is no live customer, or a typed Shipper / Consignee Contact", () => {
    const GONE = "00000000-0000-0000-0000-0000000000ff";
    const plan = planLinksNormalize(
      [
        // No customer: nothing to match against (the shipment's Customer is what needs linking).
        shipment({ id: "s-1", customer: "Alfa", customerPic: "Petr" }),
        // A typed contact of a party that is no customer.
        shipment({ id: "s-2", shipper: "Somebody", shipperContact: "Gate keeper" }),
        // A customer that is gone: its own name is reported, its contact is not.
        shipment({ id: "s-3", customerId: GONE, customer: "Gone Ltd", customerPic: "Petr" }),
        // A Shipper / Consignee Contact may be anybody.
        shipment({ id: "s-4", shipperId: BETA, shipper: "Beta a.s.", shipperContact: "Gate keeper", consigneeId: ALFA, consignee: "Alfa s.r.o.", consigneeContact: "Driver" }),
      ],
      [],
      refs,
    );
    expect(plan.shipments).toEqual([]);
    expect(plan.unmatched).toEqual([{ field: "customer", value: "Gone Ltd", count: 1 }]);
    // The gone customer and s-4's parties and contacts were checked; the rest had nothing to check.
    expect(plan.checked).toBe(5);
  });

  it("reports a typed Shipper / Consignee Contact that fits several contacts of the party: somebody has to pick one", () => {
    const PAVEL = { id: "00000000-0000-0000-0000-00000000c004", name: "Petr Pavel" };
    const plan = planLinksNormalize(
      [shipment({ shipperId: ALFA, shipper: "Alfa s.r.o.", shipperContact: "Petr" })],
      [],
      { ...refs, contacts: [...refs.contacts, { ...PAVEL, customerId: ALFA }] },
    );
    expect(plan.shipments).toEqual([]);
    expect(plan.unmatched).toEqual([{ field: "shipperContact", value: "Petr", count: 1 }]);
  });

  it("writes a contact's name without the spaces around it", () => {
    const plan = planLinksNormalize(
      [shipment({ customerId: ALFA, customer: "Alfa s.r.o.", customerPic: "Petr" })],
      [],
      { ...refs, contacts: [{ ...PETR, name: " Petr Masák ", customerId: ALFA }] },
    );
    expect(plan.shipments[0]!.to).toEqual({ customerPicContactId: PETR.id, customerPic: "Petr Masák" });
  });

  it("finds nothing to do the second time", () => {
    const rows = [shipment({ customerId: ALFA, customer: "Alfa", customerPic: "Petr", shipperId: BETA, shipper: "Beta", shipperContact: "Eva" })];
    const first = planLinksNormalize(rows, [], refs);
    const after = rows.map((row) => ({ ...row, ...first.shipments.find((r) => r.id === row.id)?.to }));
    const second = planLinksNormalize(after, [], refs);
    expect(second.shipments).toEqual([]);
    expect(second.unmatched).toEqual([]);
  });

  it("lists every customer id the rows link to, once", () => {
    expect(
      linkedCustomerIds([shipment({ customerId: ALFA, shipperId: BETA, consigneeId: ALFA }), shipment({ principalPartyId: BETA })], [masterJob({ shipperId: ALFA, consigneeId: "c-3" })]).sort(),
    ).toEqual([ALFA, BETA, "c-3"].sort());
  });
});
