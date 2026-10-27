import { beforeEach, describe, expect, it, vi } from "vitest";

// The service is run for real - with the matching rules - against stand-ins for the repositories
// and the Customer Database. What the statements do to rows is checked in the repository's test.
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), info: vi.fn() } }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({ customers: { _internalCustomerRefs: vi.fn() } }));
vi.mock("../../repositories/salesQuote.repository", () => ({ salesQuoteRepository: { adoptPending: vi.fn() } }));
vi.mock("../../repositories/quoteCustomerLinks.repository", () => ({
  quoteCustomerLinksRepository: {
    followCustomer: vi.fn(),
    followContact: vi.fn(),
    openWithCustomer: vi.fn(),
    applyCopies: vi.fn(),
  },
}));

import { customers } from "~encore/clients";
import type { CustomerLabel } from "../../../customers/interfaces/interfaces";
import { quoteCustomerLinksRepository, type CurrentContact, type CurrentCustomer } from "../../repositories/quoteCustomerLinks.repository";
import { salesQuoteRepository } from "../../repositories/salesQuote.repository";
import { quoteLinksService } from "../../services/quoteLinks.service";

const links = vi.mocked(quoteCustomerLinksRepository);
const quotes = vi.mocked(salesQuoteRepository);
const refs = vi.mocked(customers._internalCustomerRefs);

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const ACME = "6d1c3f0e-1a2b-4c3d-8e9f-000000000001";
const GONE = "6d1c3f0e-1a2b-4c3d-8e9f-000000000002";
const PETR = "7a000000-0000-4000-8000-000000000001";
const JANA = "7a000000-0000-4000-8000-000000000002";

// A handler has no login: it asks the Customer Database for the event's company.
const AS_COMPANY = { authData: { userID: "", companyID: COMPANY, role: "user" } };

/** What the handlers' reads gave the repository to write, in order (null = nothing). */
let written: unknown[];

beforeEach(() => {
  vi.resetAllMocks();
  written = [];
  // The repository takes the turn and then asks for what to write; the stand-in only asks.
  links.followCustomer.mockImplementation(async (_company: string, _customer: string, current: CurrentCustomer) => {
    const copies = await current();
    written.push(copies);
    return copies ? ["q1"] : [];
  });
  links.followContact.mockImplementation(async (_company: string, _customer: string, _contact: string, current: CurrentContact) => {
    const found = await current();
    written.push(found);
    return found ? ["q1"] : [];
  });
  links.openWithCustomer.mockResolvedValue([]);
  links.applyCopies.mockResolvedValue(true);
  refs.mockResolvedValue({ customers: [], contacts: [] });
});

describe("customerChanged", () => {
  const event = { companyId: COMPANY, customerId: ACME, companyName: "ACME", label: "STANDARD", deleted: false };
  const live = (companyName: string, label: CustomerLabel = "KEY ACCOUNT") => refs.mockResolvedValue({ customers: [{ id: ACME, companyName, label }], contacts: [] });

  it("writes the customer as the Customer Database has it now, not as the event says", async () => {
    live("ACME Logistics s.r.o.", "RISK");
    await expect(quoteLinksService.customerChanged(event)).resolves.toBe(1);
    expect(links.followCustomer).toHaveBeenCalledWith(COMPANY, ACME, expect.any(Function));
    expect(refs).toHaveBeenCalledWith({ customerIds: [ACME] }, AS_COMPANY);
    expect(written).toEqual([{ name: "ACME Logistics s.r.o.", label: "RISK" }]);
  });

  it("an older event delivered after a newer one does not bring the old name back", async () => {
    live("ACME Group");
    await quoteLinksService.customerChanged({ ...event, companyName: "ACME Group", label: "KEY ACCOUNT" });
    await quoteLinksService.customerChanged({ ...event, companyName: "ACME" });
    expect(written).toEqual([
      { name: "ACME Group", label: "KEY ACCOUNT" },
      { name: "ACME Group", label: "KEY ACCOUNT" },
    ]);
  });

  it("a deleted customer's quotes take the last name and type its delete event carries", async () => {
    await quoteLinksService.customerChanged({ ...event, companyName: " ACME Final s.r.o. ", label: "RISK", deleted: true });
    expect(written).toEqual([{ name: "ACME Final s.r.o.", label: "RISK" }]);
  });

  it("a delete event of a customer restored since takes the customer as it is now", async () => {
    live("ACME Group");
    await quoteLinksService.customerChanged({ ...event, deleted: true });
    expect(written).toEqual([{ name: "ACME Group", label: "KEY ACCOUNT" }]);
  });

  it("an edit of a customer deleted since writes nothing (its delete event does)", async () => {
    await expect(quoteLinksService.customerChanged(event)).resolves.toBe(0);
    expect(written).toEqual([null]);
  });

  it("fails when the Customer Database cannot be read, so the event is delivered again", async () => {
    refs.mockRejectedValue(new Error("down"));
    await expect(quoteLinksService.customerChanged(event)).rejects.toThrow("down");
  });

  it("ignores an event that names no customer, rather than failing on it again and again", async () => {
    await expect(quoteLinksService.customerChanged({ ...event, customerId: "x" })).resolves.toBe(0);
    expect(links.followCustomer).not.toHaveBeenCalled();
    expect(refs).not.toHaveBeenCalled();
  });
});

describe("contactChanged", () => {
  const event = { companyId: COMPANY, customerId: ACME, contactId: PETR, name: "Petr", email: "old@acme.cz", phone: "", deleted: false };
  const petr = { id: PETR, customerId: ACME, name: "Petr Masák", email: "petr@acme.cz", phone: "+420 601 000 001", isMain: true };
  const live = (...contacts: (typeof petr)[]) => refs.mockResolvedValue({ customers: [{ id: ACME, companyName: "ACME", label: "STANDARD" }], contacts });

  it("writes the contact as the Customer Database has it now, not as the event says", async () => {
    live(petr);
    await expect(quoteLinksService.contactChanged(event)).resolves.toBe(1);
    expect(links.followContact).toHaveBeenCalledWith(COMPANY, ACME, PETR, expect.any(Function));
    expect(refs).toHaveBeenCalledWith({ customerIds: [ACME] }, AS_COMPANY);
    expect(written).toEqual([{ name: "Petr Masák", email: "petr@acme.cz", phone: "+420 601 000 001", gone: false }]);
  });

  it("an older event delivered after a newer one does not bring the old details back", async () => {
    live(petr);
    await quoteLinksService.contactChanged({ ...event, name: "Petr Masák", email: "petr@acme.cz", phone: "+420 601 000 001" });
    await quoteLinksService.contactChanged(event);
    expect(written).toEqual([
      { name: "Petr Masák", email: "petr@acme.cz", phone: "+420 601 000 001", gone: false },
      { name: "Petr Masák", email: "petr@acme.cz", phone: "+420 601 000 001", gone: false },
    ]);
  });

  it("a deleted contact's quotes keep the last details its delete event carries, unlinked", async () => {
    await quoteLinksService.contactChanged({ ...event, name: "Petr Masák", email: "petr@acme.cz", deleted: true });
    expect(written).toEqual([{ name: "Petr Masák", email: "petr@acme.cz", phone: "", gone: true }]);
  });

  it("a delete event of a contact that is live again keeps the link and its current details", async () => {
    live(petr);
    await quoteLinksService.contactChanged({ ...event, deleted: true });
    expect(written).toEqual([{ name: "Petr Masák", email: "petr@acme.cz", phone: "+420 601 000 001", gone: false }]);
  });

  it("an edit of a contact deleted since writes nothing, nor does one whose id is another customer's contact", async () => {
    await quoteLinksService.contactChanged(event);
    live({ ...petr, customerId: GONE });
    await quoteLinksService.contactChanged(event);
    expect(written).toEqual([null, null]);
  });

  it("ignores an event that names no contact", async () => {
    await expect(quoteLinksService.contactChanged({ ...event, contactId: "" })).resolves.toBe(0);
    expect(links.followContact).not.toHaveBeenCalled();
  });
});

describe("normalize", () => {
  it("adopts old quotes first, then refreshes and links the open quotes, and lists what it could not link", async () => {
    links.openWithCustomer.mockResolvedValue([
      // Renamed customer, contact typed as a first name only.
      { id: "q1", quoteNumber: "QCZ1", customerId: ACME, doc: { customerId: ACME, customerName: "ACME", customerContact: "Petr" } },
      // Up to date and linked already: nothing is written.
      {
        id: "q2",
        quoteNumber: "QCZ2",
        customerId: ACME,
        doc: { customerId: ACME, customerName: "ACME Logistics s.r.o.", customerLabel: "KEY ACCOUNT", customerContactId: JANA, customerContact: "Jana Nováková", customerEmail: "jana@acme.cz", customerPhone: "" },
      },
      // A name that is no contact of the customer.
      { id: "q3", quoteNumber: "QCZ3", customerId: ACME, doc: { customerId: ACME, customerName: "ACME Logistics s.r.o.", customerLabel: "KEY ACCOUNT", customerContact: "Pavel" } },
      // A deleted customer.
      { id: "q4", quoteNumber: "QCZ4", customerId: GONE, doc: { customerId: GONE, customerName: "Gone s.r.o.", customerContact: "Karel" } },
      { id: "q5", quoteNumber: "QCZ5", customerId: GONE, doc: { customerId: GONE, customerName: "Gone s.r.o." } },
    ]);
    refs.mockResolvedValue({
      customers: [{ id: ACME, companyName: "ACME Logistics s.r.o.", label: "KEY ACCOUNT" }],
      contacts: [
        { id: PETR, customerId: ACME, name: "Petr Masák", email: "petr@acme.cz", phone: "+420 601 000 001", isMain: true },
        { id: JANA, customerId: ACME, name: "Jana Nováková", email: "jana@acme.cz", phone: "", isMain: false },
      ],
    });

    await expect(quoteLinksService.normalize(COMPANY)).resolves.toEqual({
      checked: 5,
      changed: 1,
      unmatched: [
        { field: "customer", value: "Gone s.r.o.", count: 2 },
        { field: "customerContact", value: "Pavel (ACME Logistics s.r.o.)", count: 1 },
      ],
    });
    // Asked once for every customer the quotes name.
    expect(refs).toHaveBeenCalledWith({ customerIds: [ACME, GONE] });
    expect(links.applyCopies).toHaveBeenCalledTimes(1);
    expect(links.applyCopies).toHaveBeenCalledWith(COMPANY, "q1", { customerId: ACME, doc: { customerId: ACME, customerName: "ACME", customerContact: "Petr" } }, {
      set: {
        customerName: "ACME Logistics s.r.o.",
        customerLabel: "KEY ACCOUNT",
        customerContactId: PETR,
        customerContact: "Petr Masák",
        customerEmail: "petr@acme.cz",
        customerPhone: "+420 601 000 001",
      },
      customerMissing: false,
      unmatchedContact: "",
    });
    expect(quotes.adoptPending.mock.invocationCallOrder[0]).toBeLessThan(links.openWithCustomer.mock.invocationCallOrder[0]!);
  });

  it("leaves a contact an editor typed by hand (or unlinked) as typed, run after run", async () => {
    // "Petr" alone would be linked to Petr Masák by the matching rules - but it was typed on purpose.
    const typed = { customerId: ACME, customerName: "ACME Logistics s.r.o.", customerLabel: "KEY ACCOUNT", customerContactId: "", customerContact: "Petr", customerEmail: "petr.private@mail.cz" };
    links.openWithCustomer.mockResolvedValue([{ id: "q1", quoteNumber: "QCZ1", customerId: ACME, doc: typed }]);
    refs.mockResolvedValue({
      customers: [{ id: ACME, companyName: "ACME Logistics s.r.o.", label: "KEY ACCOUNT" }],
      contacts: [{ id: PETR, customerId: ACME, name: "Petr Masák", email: "petr@acme.cz", phone: "+420 601 000 001", isMain: true }],
    });
    for (let run = 0; run < 2; run++) {
      await expect(quoteLinksService.normalize(COMPANY)).resolves.toEqual({ checked: 1, changed: 0, unmatched: [] });
    }
    expect(links.applyCopies).not.toHaveBeenCalled();
  });

  it("does not count a quote an edit changed meanwhile", async () => {
    links.openWithCustomer.mockResolvedValue([{ id: "q1", quoteNumber: "QCZ1", customerId: ACME, doc: { customerId: ACME, customerName: "ACME" } }]);
    refs.mockResolvedValue({ customers: [{ id: ACME, companyName: "ACME Logistics s.r.o.", label: "STANDARD" }], contacts: [] });
    links.applyCopies.mockResolvedValue(false);
    await expect(quoteLinksService.normalize(COMPANY)).resolves.toMatchObject({ checked: 1, changed: 0 });
  });

  it("fails instead of guessing when the Customer Database cannot be read", async () => {
    links.openWithCustomer.mockResolvedValue([{ id: "q1", quoteNumber: "QCZ1", customerId: ACME, doc: { customerId: ACME } }]);
    refs.mockRejectedValue(new Error("down"));
    await expect(quoteLinksService.normalize(COMPANY)).rejects.toThrow("down");
    expect(links.applyCopies).not.toHaveBeenCalled();
  });

  it("asks the Customer Database nothing when no open quote names a customer", async () => {
    await expect(quoteLinksService.normalize(COMPANY)).resolves.toEqual({ checked: 0, changed: 0, unmatched: [] });
    expect(refs).not.toHaveBeenCalled();
  });
});
