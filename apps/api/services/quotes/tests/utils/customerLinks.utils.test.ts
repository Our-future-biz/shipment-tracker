import { describe, expect, it } from "vitest";
import type { CustomerContactRef, CustomerRef } from "../../../customers/interfaces/interfaces";
import {
  LINKED_COPY_STATUSES,
  copiesFollowCustomers,
  linkForSave,
  matchContact,
  refreshCopies,
  withRefresh,
  type CustomerRefs,
} from "../../utils/customerLinks.utils";
import { PRICING_CLOSED, SHOWN_STATUSES } from "../../utils/quoteLifecycle.utils";

const ACME = "6d1c3f0e-1a2b-4c3d-8e9f-000000000001";
const OTHER = "6d1c3f0e-1a2b-4c3d-8e9f-000000000002";
const PETR = "7a000000-0000-4000-8000-000000000001";
const JANA = "7a000000-0000-4000-8000-000000000002";
const KAREL = "7a000000-0000-4000-8000-000000000003";

const customer = (id: string, companyName: string, label: CustomerRef["label"] = "STANDARD"): CustomerRef => ({ id, companyName, label });
const contact = (id: string, customerId: string, name: string, email = "", phone = ""): CustomerContactRef => ({ id, customerId, name, email, phone, isMain: false });

const REFS: CustomerRefs = {
  customers: [customer(ACME, "ACME Logistics s.r.o.", "KEY ACCOUNT")],
  contacts: [
    contact(PETR, ACME, "Petr Masák", "petr@acme.cz", "+420 601 000 001"),
    contact(JANA, ACME, "Jana Nováková", "jana@acme.cz", "+420 601 000 002"),
    contact(KAREL, OTHER, "Karel Dvořák", "karel@other.cz"),
  ],
};

describe("LINKED_COPY_STATUSES", () => {
  it("are exactly the statuses whose prices and details are still open (not PRICING_CLOSED)", () => {
    expect([...LINKED_COPY_STATUSES].sort()).toEqual(SHOWN_STATUSES.filter((s) => !PRICING_CLOSED.includes(s)).sort());
  });

  it("include the revision of a Won quote, not a Won quote itself, and no row without a status", () => {
    expect(copiesFollowCustomers("draft", {})).toBe(true);
    expect(copiesFollowCustomers("ready_to_send", {})).toBe(true);
    expect(copiesFollowCustomers("revised", {})).toBe(true);
    expect(copiesFollowCustomers("won", { wonRevisionOf: "QCZ20261010001" })).toBe(true);
    expect(copiesFollowCustomers("won", {})).toBe(false);
    for (const status of ["quoted", "feedback", "lost", "expired", "replaced"]) expect(copiesFollowCustomers(status, {})).toBe(false);
    expect(copiesFollowCustomers(null, {})).toBe(false);
  });
});

describe("matchContact", () => {
  const contacts = [contact(PETR, ACME, "Petr Masák"), contact(JANA, ACME, "Jana Nováková"), contact(KAREL, ACME, "Jana Nováková Dvořák")];

  it("finds the contact of the same name, whatever the case, accents and spacing", () => {
    expect(matchContact("  petr   MASAK ", contacts)?.id).toBe(PETR);
  });

  it("prefers the same name to a longer one that starts with it", () => {
    expect(matchContact("Jana Nováková", contacts)?.id).toBe(JANA);
  });

  it("else finds the only contact whose name starts with the text as whole words", () => {
    expect(matchContact("Petr", contacts)?.id).toBe(PETR);
    // Not inside a word.
    expect(matchContact("Pet", contacts)).toBeNull();
  });

  it("finds nobody when the text fits several or none", () => {
    expect(matchContact("Jana", contacts)).toBeNull();
    expect(matchContact("Pavel", contacts)).toBeNull();
    expect(matchContact("", contacts)).toBeNull();
    expect(matchContact("Petr Masák", [...contacts, contact(KAREL, ACME, "Petr Masák")])).toBeNull();
  });
});

describe("linkForSave", () => {
  it("takes the customer's current name and account type by its id", () => {
    const result = linkForSave({ customerId: ACME, customerName: "ACME", customerLabel: "RISK", origin: "Praha" }, null, REFS);
    expect(result).toEqual({ ok: true, data: { customerId: ACME, customerName: "ACME Logistics s.r.o.", customerLabel: "KEY ACCOUNT", origin: "Praha" } });
  });

  it("stores the picked contact with their current name, e-mail and phone", () => {
    const result = linkForSave({ customerId: ACME, customerContactId: PETR, customerContact: "Petr", customerEmail: "old@acme.cz" }, null, REFS);
    expect(result).toMatchObject({
      ok: true,
      data: { customerContactId: PETR, customerContact: "Petr Masák", customerEmail: "petr@acme.cz", customerPhone: "+420 601 000 001" },
    });
  });

  it("refuses a contact of another customer, a contact without a customer, and what is no id", () => {
    expect(linkForSave({ customerId: ACME, customerContactId: KAREL }, null, REFS)).toMatchObject({ ok: false, code: "invalid" });
    expect(linkForSave({ customerContactId: PETR, customerContact: "Petr" }, null, REFS)).toMatchObject({ ok: false, code: "invalid" });
    expect(linkForSave({ customerId: ACME, customerContactId: "Petr" }, null, REFS)).toMatchObject({ ok: false, code: "invalid" });
  });

  it("stores a contact typed by hand (null or empty id) as text, marked as typed (\"\")", () => {
    for (const customerContactId of [null, ""]) {
      const result = linkForSave({ customerId: ACME, customerContactId, customerContact: "Petr", customerEmail: "pavel@acme.cz" }, null, REFS);
      expect(result).toEqual({
        ok: true,
        data: { customerId: ACME, customerName: "ACME Logistics s.r.o.", customerLabel: "KEY ACCOUNT", customerContactId: "", customerContact: "Petr", customerEmail: "pavel@acme.cz" },
      });
    }
  });

  it("keeps the stored link when the editor leaves the key out but keeps the customer and the contact name", () => {
    const stored = { customerId: ACME, customerContactId: PETR, customerContact: "Petr Masák" };
    expect(linkForSave({ customerId: ACME, customerContact: "Petr Masák" }, stored, REFS)).toMatchObject({ ok: true, data: { customerContactId: PETR } });
    // Another name typed: typed by hand. Another customer: nothing decided for it yet.
    expect(linkForSave({ customerId: ACME, customerContact: "Pavel" }, stored, REFS)).toMatchObject({ ok: true, data: { customerContactId: "", customerContact: "Pavel" } });
    const other = linkForSave({ customerId: OTHER, customerContact: "Petr Masák" }, stored, REFS);
    expect(other.ok && other.data).not.toHaveProperty("customerContactId");
  });

  it("keeps a contact typed by hand typed when the editor leaves the key out", () => {
    const stored = { customerId: ACME, customerContactId: "", customerContact: "Petr", customerEmail: "pavel@acme.cz" };
    expect(linkForSave({ customerId: ACME, customerContact: "Petr", customerEmail: "pavel@acme.cz" }, stored, REFS)).toMatchObject({
      ok: true,
      data: { customerContactId: "", customerContact: "Petr", customerEmail: "pavel@acme.cz" },
    });
    expect(linkForSave({ customerId: ACME, customerContact: "Petr" }, stored, null)).toMatchObject({ ok: true, data: { customerContactId: "" } });
  });

  it("leaves the key out for a quote where nothing was decided yet (new, or from before contacts were linked)", () => {
    for (const stored of [null, { customerId: ACME, customerContact: "Petr" }]) {
      const result = linkForSave({ customerId: ACME, customerContact: "Petr" }, stored, REFS);
      expect(result.ok && result.data).not.toHaveProperty("customerContactId");
    }
  });

  it("turns a link to a contact deleted since it was stored into typed text, keeping the name, instead of refusing the save", () => {
    const stored = { customerId: ACME, customerContactId: PETR, customerContact: "Petr Masák" };
    const refs = { ...REFS, contacts: REFS.contacts.filter((c) => c.id !== PETR) };
    for (const incoming of [{ customerId: ACME, customerContactId: PETR, customerContact: "Petr Masák" }, { customerId: ACME, customerContact: "Petr Masák" }]) {
      expect(linkForSave(incoming, stored, refs)).toMatchObject({ ok: true, data: { customerContactId: "", customerContact: "Petr Masák" } });
    }
  });

  it("keeps the contact link of a customer that is deleted: its contacts are not known", () => {
    const stored = { customerId: OTHER, customerContactId: KAREL, customerContact: "Karel" };
    const refs = { customers: [], contacts: [] };
    expect(linkForSave({ customerId: OTHER, customerContactId: KAREL, customerContact: "Karel" }, stored, refs)).toMatchObject({ ok: true, data: { customerContactId: KAREL } });
  });

  it("keeps the name of a customer that is deleted", () => {
    expect(linkForSave({ customerId: OTHER, customerName: "Other s.r.o." }, null, REFS)).toEqual({ ok: true, data: { customerId: OTHER, customerName: "Other s.r.o." } });
  });

  it("takes the document as sent when the Customer Database cannot be read - but cannot check a newly picked contact", () => {
    const stored = { customerId: ACME, customerContactId: PETR, customerContact: "Petr" };
    expect(linkForSave({ customerId: ACME, customerName: "ACME", customerContactId: PETR, customerContact: "Petr" }, stored, null)).toEqual({
      ok: true,
      data: { customerId: ACME, customerName: "ACME", customerContactId: PETR, customerContact: "Petr" },
    });
    expect(linkForSave({ customerId: ACME, customerContactId: JANA }, stored, null)).toMatchObject({ ok: false, code: "unavailable" });
  });

  it("writes ids the way the Customer Database has them", () => {
    const result = linkForSave({ customerId: ACME.toUpperCase(), customerContactId: PETR.toUpperCase() }, null, REFS);
    expect(result).toMatchObject({ ok: true, data: { customerContactId: PETR, customerContact: "Petr Masák" } });
  });

  it("does nothing to a quote for no customer record", () => {
    expect(linkForSave({ customerName: "Typed s.r.o.", customerContact: "Somebody" }, null, REFS)).toEqual({ ok: true, data: { customerName: "Typed s.r.o.", customerContact: "Somebody" } });
  });
});

describe("refreshCopies", () => {
  it("sets only what differs from the Customer Database", () => {
    const doc = { customerId: ACME, customerName: "ACME", customerLabel: "KEY ACCOUNT", customerContactId: PETR, customerContact: "Petr", customerEmail: "petr@acme.cz", customerPhone: "+420 601 000 001" };
    expect(refreshCopies(doc, REFS, { linkByName: false })).toEqual({
      set: { customerName: "ACME Logistics s.r.o.", customerContact: "Petr Masák" },
      customerMissing: false,
      unmatchedContact: "",
    });
  });

  it("links a contact name of a quote from before contacts were linked (no key) to the one contact it names", () => {
    const doc = { customerId: ACME, customerName: "ACME Logistics s.r.o.", customerLabel: "KEY ACCOUNT", customerContact: "Petr" };
    const refresh = refreshCopies(doc, REFS, { linkByName: true });
    expect(refresh.set).toEqual({ customerContactId: PETR, customerContact: "Petr Masák", customerEmail: "petr@acme.cz", customerPhone: "+420 601 000 001" });
    expect(withRefresh(doc, refresh)).toMatchObject({ customerContactId: PETR, customerContact: "Petr Masák" });
  });

  it("leaves a name that is no single contact as it is, and says so", () => {
    const refresh = refreshCopies({ customerId: ACME, customerName: "ACME Logistics s.r.o.", customerLabel: "KEY ACCOUNT", customerContact: "Pavel" }, REFS, { linkByName: true });
    expect(refresh).toEqual({ set: {}, customerMissing: false, unmatchedContact: "Pavel" });
    // Without linkByName nothing is looked for.
    expect(refreshCopies({ customerId: ACME, customerContact: "Pavel" }, REFS, { linkByName: false }).unmatchedContact).toBe("");
  });

  it("never links a contact typed by hand, not even with linkByName, and leaves its e-mail and phone", () => {
    const doc = { customerId: ACME, customerName: "ACME Logistics s.r.o.", customerLabel: "KEY ACCOUNT", customerContactId: "", customerContact: "Petr", customerEmail: "other@mail.cz" };
    expect(refreshCopies(doc, REFS, { linkByName: true })).toEqual({ set: {}, customerMissing: false, unmatchedContact: "" });
  });

  it("turns a link to a contact that is gone, or a value that is no id, into typed text, and keeps the name", () => {
    const doc = { customerId: ACME, customerName: "ACME Logistics s.r.o.", customerLabel: "KEY ACCOUNT", customerContactId: KAREL, customerContact: "Karel" };
    const refresh = refreshCopies(doc, REFS, { linkByName: true });
    expect(refresh).toEqual({ set: { customerContactId: "" }, customerMissing: false, unmatchedContact: "" });
    expect(withRefresh(doc, refresh)).toEqual({ ...doc, customerContactId: "" });
    // Not linked by name either: "Petr" stays.
    for (const customerContactId of ["x", null, 7]) {
      expect(refreshCopies({ ...doc, customerContactId, customerContact: "Petr" }, REFS, { linkByName: true }).set).toEqual({ customerContactId: "" });
    }
  });

  it("keeps the contact link of a customer that is deleted", () => {
    expect(refreshCopies({ customerId: OTHER, customerName: "Other", customerContactId: PETR, customerContact: "Petr" }, { customers: [], contacts: [] }, { linkByName: true })).toEqual({
      set: {},
      customerMissing: true,
      unmatchedContact: "",
    });
  });

  it("says when the customer record is gone - and links no contact of it", () => {
    expect(refreshCopies({ customerId: OTHER, customerName: "Other", customerContact: "Karel Dvořák" }, REFS, { linkByName: true })).toEqual({
      set: {},
      customerMissing: true,
      unmatchedContact: "",
    });
  });

  it("does nothing to a document without a customer record", () => {
    expect(refreshCopies({ customerName: "Typed" }, REFS, { linkByName: true })).toEqual({ set: {}, customerMissing: false, unmatchedContact: "" });
    expect(refreshCopies(null, REFS, { linkByName: true })).toEqual({ set: {}, customerMissing: false, unmatchedContact: "" });
  });
});
