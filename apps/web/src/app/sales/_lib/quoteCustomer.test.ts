import { describe, expect, it } from "vitest";
import {
  CUSTOMER_UNIT_KEYS,
  NO_CUSTOMER,
  contactFields,
  contactFieldsOf,
  contactOfName,
  customerCopiesUnsaved,
  followStoredCustomer,
  liveCustomerCopies,
  namedContact,
  sameCustomerUnit,
  withContactChecked,
  withCustomerUnit,
} from "./quoteCustomer";
import { SECTION_FIELDS, hasSection, pickSections } from "./quoteSections";
import type { SalesQuoteData } from "./types";

const petr = { id: "k-petr", name: "Petr Masák", email: "petr@acme.cz", phone: "+420 111", isMain: false };
const jana = { id: "k-jana", name: "Jana Nová", email: "jana@acme.cz", phone: "+420 222", isMain: true };
const contacts = [petr, jana];

// A quote for ACME with Petr picked from its contacts.
const linked: SalesQuoteData = {
  customerId: "c-acme",
  customerName: "ACME s.r.o.",
  customerLabel: "STANDARD",
  ...contactFields(petr),
  origin: "Prague",
};

describe("NO_CUSTOMER", () => {
  it("empties every key of the unit, the contact link as null so a save ends a stored link", () => {
    expect(Object.keys(NO_CUSTOMER).sort()).toEqual([...CUSTOMER_UNIT_KEYS].sort());
    expect(NO_CUSTOMER.customerContactId).toBeNull();
  });
});

describe("withCustomerUnit and the contact link", () => {
  it("a typed contact person ends the link", () => {
    expect(withCustomerUnit(linked, { customerContact: "Pavel" })).toEqual({ customerContact: "Pavel", customerContactId: null });
  });

  it("an e-mail or phone typed or imported over the contact's ends it too", () => {
    expect(withCustomerUnit(linked, { customerEmail: "other@acme.cz" })).toEqual({ customerEmail: "other@acme.cz", customerContactId: null });
  });

  it("the contact's own values brought again keep the link", () => {
    expect(withCustomerUnit(linked, { customerEmail: petr.email, customerContact: petr.name })).toEqual({ customerEmail: petr.email, customerContact: petr.name });
  });

  it("a picked contact keeps its id", () => {
    expect(withCustomerUnit(linked, contactFields(jana))).toEqual(contactFields(jana));
  });

  it("changes that are not about the contact leave the link alone", () => {
    expect(withCustomerUnit(linked, { origin: "Brno" })).toEqual({ origin: "Brno" });
  });

  it("another customer takes the whole unit: the link is emptied with the rest", () => {
    expect(withCustomerUnit(linked, { customerId: "c-other", customerName: "Other" })).toEqual({ ...NO_CUSTOMER, customerId: "c-other", customerName: "Other" });
  });

  it("an inquiry naming the linked customer by name brings its contact as typed text", () => {
    expect(withCustomerUnit(linked, { customerName: "acme S.R.O. ", customerContact: "Eva" })).toEqual({ customerContact: "Eva", customerContactId: null });
  });
});

describe("contactOfName", () => {
  it("finds the one contact of that name, case, accents and spacing aside", () => {
    expect(contactOfName(contacts, "  petr   MASAK ")).toBe(petr);
  });

  it("finds none for a part of a name, an empty name or a name two contacts share", () => {
    expect(contactOfName(contacts, "Petr")).toBeUndefined();
    expect(contactOfName(contacts, " ")).toBeUndefined();
    expect(contactOfName([petr, { ...petr, id: "k-petr-2" }], "Petr Masák")).toBeUndefined();
  });
});

describe("namedContact", () => {
  const typed = { customerContactId: null, customerContact: "petr masak" };

  it("links a typed name without asking while the e-mail and phone are empty or the contact's", () => {
    expect(namedContact(contacts, typed)).toEqual({ contact: petr, keepsDetails: true });
    expect(namedContact(contacts, { ...typed, customerEmail: " PETR@acme.cz", customerPhone: "+420111" })).toEqual({ contact: petr, keepsDetails: true });
  });

  it("only offers the link when it would replace a typed e-mail or phone", () => {
    expect(namedContact(contacts, { ...typed, customerEmail: "office@acme.cz" })).toEqual({ contact: petr, keepsDetails: false });
    expect(namedContact(contacts, { ...typed, customerPhone: "+420 999" })).toEqual({ contact: petr, keepsDetails: false });
    // The contact has no e-mail: linking would empty the typed one.
    expect(namedContact([{ ...petr, email: "" }], { ...typed, customerEmail: "office@acme.cz" })?.keepsDetails).toBe(false);
  });

  it("says nothing for a linked quote or a name that is no one contact's", () => {
    expect(namedContact(contacts, linked)).toBeUndefined();
    expect(namedContact(contacts, { customerContact: "Petr" })).toBeUndefined();
    expect(namedContact(contacts, {})).toBeUndefined();
  });
});

describe("contactFieldsOf", () => {
  it("takes the main contact, with its id", () => {
    expect(contactFieldsOf(contacts)).toEqual({ customerContactId: "k-jana", customerContact: "Jana Nová", customerEmail: "jana@acme.cz", customerPhone: "+420 222" });
  });

  it("takes the first contact when none is the main one, and nothing without contacts", () => {
    expect(contactFieldsOf([petr]).customerContactId).toBe("k-petr");
    expect(contactFieldsOf([])).toEqual({});
  });

  it("takes the contact a copied shipment names by id, else by name, else the main one", () => {
    expect(contactFieldsOf(contacts, { id: "k-petr", name: "whoever" }).customerContactId).toBe("k-petr");
    expect(contactFieldsOf(contacts, { id: "k-gone", name: "petr masak" }).customerContactId).toBe("k-petr");
    expect(contactFieldsOf(contacts, { id: "k-gone", name: "Somebody" }).customerContactId).toBe("k-jana");
  });
});

describe("withContactChecked", () => {
  const copied: Partial<SalesQuoteData> = { customerId: "c-acme", customerContactId: "k-petr", customerContact: "Petr", customerEmail: "old@acme.cz" };

  it("keeps a link to a contact the customer still has, with the contact's values as they are now", () => {
    expect(withContactChecked(copied, contacts)).toEqual({ ...copied, ...contactFields(petr) });
  });

  it("ends a link to a contact that is gone, or that could not be checked; the name stays", () => {
    expect(withContactChecked(copied, [jana])).toEqual({ ...copied, customerContactId: null });
    expect(withContactChecked(copied, null)).toEqual({ ...copied, customerContactId: null });
  });

  it("ends a link copied without its customer", () => {
    expect(withContactChecked({ customerContactId: "k-petr" }, contacts)).toEqual({ customerContactId: null });
  });

  it("leaves a patch without a link as it is", () => {
    const typed = { customerId: "c-acme", customerContact: "Petr" };
    expect(withContactChecked(typed, null)).toBe(typed);
  });
});

describe("sameCustomerUnit", () => {
  it("takes nothing, null and an empty text alike", () => {
    expect(sameCustomerUnit({ customerContactId: null, customerEmail: "" }, {})).toBe(true);
    expect(sameCustomerUnit(linked, { ...linked, customerContact: "Petr" })).toBe(false);
  });

  it("looks only at the unit", () => {
    expect(sameCustomerUnit(linked, { ...linked, origin: "Brno" })).toBe(true);
  });
});

describe("customerCopiesUnsaved", () => {
  it("is set while the page shows a rename the stored quote does not hold (Petr -> Petr Masák)", () => {
    const stored = { ...linked, customerContact: "Petr", customerEmail: "old@acme.cz" };
    expect(customerCopiesUnsaved(linked, stored)).toBe(true);
    expect(customerCopiesUnsaved({ ...linked, customerName: "ACME a.s." }, linked)).toBe(true);
  });

  it("is clear when the copies are the stored ones, other keys and empty values aside", () => {
    expect(customerCopiesUnsaved({ ...linked, origin: "Brno" }, linked)).toBe(false);
    expect(customerCopiesUnsaved({ customerContactId: null, customerPhone: "" }, {})).toBe(false);
  });
});

describe("followStoredCustomer", () => {
  // The server named the customer and the contact as the Customer Database has them now.
  const stored: SalesQuoteData = { ...linked, customerName: "ACME a.s.", customerContact: "Petr Masák Jr.", origin: "stored origin" };

  it("takes who the quote is for as stored when the user has not changed it since the server saw it", () => {
    const draft = { ...linked, origin: "typed meanwhile" };
    expect(followStoredCustomer(draft, linked, stored)).toEqual({ ...draft, customerName: "ACME a.s.", customerContact: "Petr Masák Jr." });
  });

  it("keeps a change of the user's made since: it is still to be saved", () => {
    const draft = { ...linked, customerContact: "Pavel", customerContactId: null };
    expect(followStoredCustomer(draft, linked, stored)).toBe(draft);
  });

  it("drops a link the server no longer stores (the contact is gone)", () => {
    const withoutLink: SalesQuoteData = { ...linked };
    delete withoutLink.customerContactId;
    const next = followStoredCustomer(linked, linked, withoutLink);
    expect(next).not.toHaveProperty("customerContactId");
    expect(next.customerContact).toBe("Petr Masák");
  });
});

describe("liveCustomerCopies", () => {
  const acme = { id: "c-acme", companyName: "ACME s.r.o.", label: "STANDARD" as const };
  const acmeContacts = { customerId: "c-acme", contacts };

  it("is empty while the copies are as the records are", () => {
    expect(liveCustomerCopies(linked, acme, acmeContacts)).toEqual({});
  });

  it("follows a renamed customer and its account type", () => {
    expect(liveCustomerCopies(linked, { ...acme, companyName: "ACME a.s.", label: "KEY ACCOUNT" as const }, acmeContacts)).toEqual({ customerName: "ACME a.s.", customerLabel: "KEY ACCOUNT" });
  });

  it("follows the linked contact's new name, e-mail and phone", () => {
    const renamed = { ...petr, name: "Petr Masák ml.", email: "pm@acme.cz" };
    expect(liveCustomerCopies(linked, acme, { customerId: "c-acme", contacts: [renamed, jana] })).toEqual({ customerContact: "Petr Masák ml.", customerEmail: "pm@acme.cz" });
  });

  it("ends the link to a contact that is gone, keeping the name", () => {
    expect(liveCustomerCopies(linked, acme, { customerId: "c-acme", contacts: [jana] })).toEqual({ customerContactId: null });
  });

  it("says nothing of records that were not read, or are another customer's", () => {
    expect(liveCustomerCopies(linked, undefined, undefined)).toEqual({});
    expect(liveCustomerCopies(linked, { ...acme, id: "c-other", companyName: "Other" }, { customerId: "c-other", contacts: [] })).toEqual({});
  });

  it("leaves a typed contact person and an unlinked customer alone", () => {
    const typed = { ...linked, customerContactId: null, customerContact: "Somebody" };
    expect(liveCustomerCopies(typed, acme, acmeContacts)).toEqual({});
    expect(liveCustomerCopies({ customerName: "Typed Ltd" }, acme, acmeContacts)).toEqual({});
  });
});

describe("the customer section of Copy from / Duplicate", () => {
  it("copies the contact's link with its name", () => {
    expect(SECTION_FIELDS.customer).toContain("customerContactId");
    expect(pickSections(linked, ["customer"])).toMatchObject({ customerId: "c-acme", customerContactId: "k-petr", customerContact: "Petr Masák" });
  });

  it("a quote without a link to a contact still has a customer section", () => {
    expect(hasSection({ customerName: "Typed Ltd" }, "customer")).toBe(true);
  });
});
