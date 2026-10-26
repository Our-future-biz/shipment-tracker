import { beforeEach, describe, expect, it, vi } from "vitest";

// What Shipments does with the Customer Database's change events and the links backfill, run
// against stand-ins for its repository, the customers service and the topic it publishes to.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), info: vi.fn() } }));
vi.mock("~encore/clients", () => ({ customers: { _internalCustomerRefs: vi.fn() } }));
vi.mock("../../topics", () => ({ shipmentPartiesChanged: { publish: vi.fn() } }));
vi.mock("../../repositories/partyLinks.repository", () => ({
  partyLinksRepository: {
    renameCustomer: vi.fn(),
    renameContact: vi.fn(),
    partiesOfCustomer: vi.fn(),
    partiesOfContact: vi.fn(),
    linksOf: vi.fn(),
    applyLinks: vi.fn(),
  },
}));

import { customers } from "~encore/clients";
import { partyLinksRepository, type CurrentName } from "../../repositories/partyLinks.repository";
import { partyLinksService } from "../../services/partyLinks.service";
import { shipmentPartiesChanged } from "../../topics";
import type { ShipmentLinks } from "../../lib/contactLinks";

const repository = vi.mocked(partyLinksRepository);
const publish = vi.mocked(shipmentPartiesChanged.publish);
const refs = vi.mocked(customers._internalCustomerRefs);

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const ALFA = "00000000-0000-0000-0000-0000000000a1";
const PETR = "00000000-0000-0000-0000-00000000c001";
const RENAMED = [
  { id: "s-1", customer: "Alfa s.r.o.", customerPic: "Petr Masák" },
  { id: "s-2", customer: "Alfa s.r.o.", customerPic: "" },
];
/** How the customers service is called from an event: for its company, with no user. */
const AS_COMPANY = { authData: { userID: "", companyID: COMPANY, role: "user" } };

/** The Customer Database as it reads now. */
const holds = (companyName: string | null, contacts: { id: string; name: string; customerId?: string }[] = []) =>
  refs.mockResolvedValue({
    customers: companyName === null ? [] : [{ id: ALFA, companyName, label: "STANDARD" }],
    contacts: contacts.map((c) => ({ customerId: ALFA, email: "", phone: "", isMain: false, ...c })),
  } as never);

/** A rename in the repository: reads the name as the transaction does once it has its turn, and reports `changed` when there is one. */
let named: (string | null)[] = [];
const renames = (changed: typeof RENAMED, values = changed.length) =>
  (async (...args: unknown[]) => {
    const name = await (args[args.length - 1] as CurrentName)();
    named.push(name);
    return name ? { changed: values, parties: changed } : { changed: 0, parties: [] };
  }) as never;

beforeEach(() => {
  vi.resetAllMocks();
  named = [];
});

describe("customerChanged", () => {
  // The event may be older than what the Customer Database holds now.
  const event = { companyId: COMPANY, customerId: ALFA, companyName: "Alfa", label: "STANDARD", deleted: false };

  it("writes the name the Customer Database holds now, not the event's, and then tells about each shipment whose Customer changed", async () => {
    holds("Alfa s.r.o.");
    repository.renameCustomer.mockImplementation(renames(RENAMED, 5));
    await expect(partyLinksService.customerChanged(event)).resolves.toBe(5);
    expect(repository.renameCustomer).toHaveBeenCalledWith(COMPANY, ALFA, expect.any(Function));
    expect(refs).toHaveBeenCalledExactlyOnceWith({ customerIds: [ALFA] }, AS_COMPANY);
    expect(named).toEqual(["Alfa s.r.o."]);
    expect(publish.mock.calls).toEqual([
      [{ companyId: COMPANY, shipmentId: "s-1", customer: "Alfa s.r.o.", customerPic: "Petr Masák" }],
      [{ companyId: COMPANY, shipmentId: "s-2", customer: "Alfa s.r.o.", customerPic: "" }],
    ]);
    // Told once the rename is through: publishing holds no transaction open.
    expect(repository.renameCustomer.mock.invocationCallOrder[0]).toBeLessThan(publish.mock.invocationCallOrder[0]!);
    expect(repository.partiesOfCustomer).not.toHaveBeenCalled();
  });

  it("an old event delivered late writes nothing older: it carries no name of its own", async () => {
    holds("Alfa Group");
    repository.renameCustomer.mockImplementation(renames([]));
    await partyLinksService.customerChanged({ ...event, companyName: "Alfa s.r.o." });
    expect(named).toEqual(["Alfa Group"]);
  });

  it("an edit's event for a customer deleted since writes nothing: the delete's event brings its last name", async () => {
    holds(null);
    repository.renameCustomer.mockImplementation(renames(RENAMED));
    await expect(partyLinksService.customerChanged(event)).resolves.toBe(0);
    expect(named).toEqual([null]);
    expect(publish).not.toHaveBeenCalled();
  });

  it("a delete's event writes the name the customer was deleted with, in its turn, and tells about the shipments it changed", async () => {
    // Renamed to "Alfa Group" and deleted at once: the rename's event found it gone.
    holds(null);
    repository.renameCustomer.mockImplementation(renames(RENAMED, 3));
    await expect(partyLinksService.customerChanged({ ...event, companyName: "Alfa Group", deleted: true })).resolves.toBe(3);
    expect(repository.renameCustomer).toHaveBeenCalledWith(COMPANY, ALFA, expect.any(Function));
    expect(refs).toHaveBeenCalledExactlyOnceWith({ customerIds: [ALFA] }, AS_COMPANY);
    expect(named).toEqual(["Alfa Group"]);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it("a delete's event for a customer restored since writes the name it holds now", async () => {
    holds("Alfa s.r.o.");
    repository.renameCustomer.mockImplementation(renames(RENAMED));
    await partyLinksService.customerChanged({ ...event, companyName: "Alfa", deleted: true });
    expect(named).toEqual(["Alfa s.r.o."]);
  });

  it("never writes an empty name, from a delete's event either", async () => {
    holds(null);
    repository.renameCustomer.mockImplementation(renames(RENAMED));
    await expect(partyLinksService.customerChanged({ ...event, companyName: "  ", deleted: true })).resolves.toBe(0);
    expect(named).toEqual([null]);
    expect(publish).not.toHaveBeenCalled();
  });

  it("a delete's event delivered again tells about every shipment of the customer", async () => {
    holds(null);
    repository.renameCustomer.mockImplementation(renames([]));
    repository.partiesOfCustomer.mockResolvedValue(RENAMED);
    await partyLinksService.customerChanged({ ...event, deleted: true }, { redelivered: true });
    expect(repository.partiesOfCustomer).toHaveBeenCalledWith(COMPANY, ALFA);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it("fails - so the event is delivered again - when the Customer Database can't be read or the news can't be published", async () => {
    refs.mockRejectedValue(new Error("customers is unreachable"));
    repository.renameCustomer.mockImplementation(renames(RENAMED));
    await expect(partyLinksService.customerChanged(event)).rejects.toThrow("customers is unreachable");
    holds("Alfa s.r.o.");
    publish.mockRejectedValue(new Error("pubsub is down"));
    await expect(partyLinksService.customerChanged(event)).rejects.toThrow("pubsub is down");
  });

  it("delivered again, tells about every shipment of the customer: the failed attempt may have renamed them without telling", async () => {
    holds("Alfa s.r.o.");
    repository.renameCustomer.mockImplementation(renames([]));
    repository.partiesOfCustomer.mockResolvedValue(RENAMED);
    await partyLinksService.customerChanged(event, { redelivered: true });
    expect(repository.partiesOfCustomer).toHaveBeenCalledWith(COMPANY, ALFA);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it("publishes many at once, in batches", async () => {
    holds("Alfa s.r.o.");
    const many = Array.from({ length: 120 }, (_, i) => ({ id: `s-${i}`, customer: "Alfa s.r.o.", customerPic: "" }));
    repository.renameCustomer.mockImplementation(renames(many));
    let inFlight = 0;
    let most = 0;
    publish.mockImplementation((async () => {
      most = Math.max(most, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 0));
      inFlight--;
    }) as never);
    await partyLinksService.customerChanged(event);
    expect(publish).toHaveBeenCalledTimes(120);
    expect(most).toBe(50);
  });
});

describe("contactChanged", () => {
  const event = { companyId: COMPANY, customerId: ALFA, contactId: PETR, name: "Petr", email: "petr@alfa.cz", phone: "", deleted: false };

  it("writes the contact's name as the Customer Database holds it now and tells about each shipment whose Customer's PIC changed", async () => {
    holds("Alfa s.r.o.", [{ id: "00000000-0000-0000-0000-00000000c002", name: "Jana Malá" }, { id: PETR, name: "Petr Masák " }]);
    repository.renameContact.mockImplementation(renames(RENAMED.slice(0, 1), 2));
    await expect(partyLinksService.contactChanged(event)).resolves.toBe(2);
    expect(repository.renameContact).toHaveBeenCalledWith(COMPANY, ALFA, PETR, expect.any(Function));
    expect(refs).toHaveBeenCalledExactlyOnceWith({ customerIds: [ALFA] }, AS_COMPANY);
    expect(named).toEqual(["Petr Masák"]);
    expect(publish).toHaveBeenCalledExactlyOnceWith({ companyId: COMPANY, shipmentId: "s-1", customer: "Alfa s.r.o.", customerPic: "Petr Masák" });
  });

  it("an edit's event for a contact deleted since writes nothing: the delete's event brings its last name", async () => {
    holds("Alfa s.r.o.", []);
    repository.renameContact.mockImplementation(renames(RENAMED));
    await expect(partyLinksService.contactChanged(event)).resolves.toBe(0);
    expect(named).toEqual([null]);
    expect(publish).not.toHaveBeenCalled();
  });

  it("a delete's event writes the name the contact was deleted with and tells about the shipments it changed", async () => {
    // Renamed to "Petr Masák" and deleted at once: the rename's event found it gone.
    holds("Alfa s.r.o.", [{ id: "00000000-0000-0000-0000-00000000c002", name: "Jana Malá" }]);
    repository.renameContact.mockImplementation(renames(RENAMED.slice(0, 1), 2));
    await expect(partyLinksService.contactChanged({ ...event, name: " Petr Masák ", deleted: true })).resolves.toBe(2);
    expect(repository.renameContact).toHaveBeenCalledWith(COMPANY, ALFA, PETR, expect.any(Function));
    expect(named).toEqual(["Petr Masák"]);
    expect(publish).toHaveBeenCalledExactlyOnceWith({ companyId: COMPANY, shipmentId: "s-1", customer: "Alfa s.r.o.", customerPic: "Petr Masák" });
  });

  it("a delete's event for a contact still live writes the name it holds now, and an empty name never", async () => {
    holds("Alfa s.r.o.", [{ id: PETR, name: "Petr Masák" }]);
    repository.renameContact.mockImplementation(renames([]));
    await partyLinksService.contactChanged({ ...event, deleted: true });
    holds("Alfa s.r.o.", []);
    await partyLinksService.contactChanged({ ...event, name: " ", deleted: true });
    expect(named).toEqual(["Petr Masák", null]);
  });

  it("the contacts of a deleted customer are gone too: the contact's delete's event still writes its name", async () => {
    holds(null, []);
    repository.renameContact.mockImplementation(renames([]));
    await partyLinksService.contactChanged({ ...event, name: "Petr Masák", deleted: true });
    expect(named).toEqual(["Petr Masák"]);
  });

  it("delivered again, tells about every shipment whose Customer's PIC is the contact", async () => {
    holds("Alfa s.r.o.", [{ id: PETR, name: "Petr Masák" }]);
    repository.renameContact.mockImplementation(renames([]));
    repository.partiesOfContact.mockResolvedValue(RENAMED.slice(0, 1));
    await partyLinksService.contactChanged(event, { redelivered: true });
    expect(repository.partiesOfContact).toHaveBeenCalledWith(COMPANY, ALFA, PETR);
    expect(publish).toHaveBeenCalledOnce();
  });
});

describe("normalizeLinks", () => {
  const shipment = (over: Partial<ShipmentLinks>): ShipmentLinks => ({
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

  it("links the company's copies by the Customer Database's current names and reports what finds nobody", async () => {
    repository.linksOf.mockResolvedValue({
      shipments: [shipment({ customerId: ALFA, customer: "Alfa", customerPic: "Petr" }), shipment({ id: "s-2", customerId: ALFA, customer: "Alfa s.r.o.", customerPic: "Karel" })],
      masterJobs: [{ id: "m-1", shipperId: ALFA, shipper: "ALFA", consigneeId: null, consignee: "" }],
    });
    refs.mockResolvedValue({
      customers: [{ id: ALFA, companyName: "Alfa s.r.o.", label: "STANDARD" }],
      contacts: [{ id: PETR, customerId: ALFA, name: "Petr Masák", email: "", phone: "", isMain: true }],
    } as never);
    repository.applyLinks.mockResolvedValueOnce({ changed: 2, parties: RENAMED.slice(0, 1) }).mockResolvedValueOnce({ changed: 1, parties: [] });

    await expect(partyLinksService.normalizeLinks(COMPANY)).resolves.toEqual({
      checked: 5,
      changed: 3,
      unmatched: [{ field: "customerPic", value: "Karel", count: 1 }],
    });
    expect(repository.linksOf).toHaveBeenCalledWith(COMPANY);
    expect(refs).toHaveBeenCalledExactlyOnceWith({ customerIds: [ALFA] });
    // The shipments and the master jobs go in chunks of their own.
    expect(repository.applyLinks.mock.calls).toEqual([
      [
        COMPANY,
        {
          shipments: [
            { id: "s-1", from: { customer: "Alfa", customerPicContactId: null, customerPic: "Petr" }, to: { customer: "Alfa s.r.o.", customerPicContactId: PETR, customerPic: "Petr Masák" }, values: 2 },
          ],
          masterJobs: [],
        },
      ],
      [COMPANY, { shipments: [], masterJobs: [{ id: "m-1", from: { shipper: "ALFA" }, to: { shipper: "Alfa s.r.o." }, values: 1 }] }],
    ]);
    expect(publish).toHaveBeenCalledExactlyOnceWith({ companyId: COMPANY, shipmentId: "s-1", customer: "Alfa s.r.o.", customerPic: "Petr Masák" });
    expect(repository.applyLinks.mock.invocationCallOrder[0]).toBeLessThan(publish.mock.invocationCallOrder[0]!);
  });

  it("applies the rewrites 500 to a transaction, tells about each chunk once it is saved, and goes on when one can't be told", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => shipment({ id: `s-${i}`, customerId: ALFA, customer: "Alfa" }));
    repository.linksOf.mockResolvedValue({ shipments: rows, masterJobs: [] });
    holds("Alfa s.r.o.");
    repository.applyLinks.mockImplementation((async (_company: string, chunk: { shipments: { id: string }[] }) => ({
      changed: chunk.shipments.length,
      parties: chunk.shipments.map(({ id }) => ({ id, customer: "Alfa s.r.o.", customerPic: "" })),
    })) as never);
    publish.mockImplementation((async ({ shipmentId }: { shipmentId: string }) => {
      if (shipmentId === "s-600") throw new Error("pubsub is down");
    }) as never);

    await expect(partyLinksService.normalizeLinks(COMPANY)).resolves.toMatchObject({ checked: 1001, changed: 1001 });
    expect(repository.applyLinks.mock.calls.map(([, chunk]) => chunk.shipments.length)).toEqual([500, 500, 1]);
    // The third chunk is told about although the second one failed.
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ shipmentId: "s-1000" }));
  });

  it("asks for the customers in chunks the customers service takes", async () => {
    const ids = Array.from({ length: 2001 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
    repository.linksOf.mockResolvedValue({ shipments: ids.map((id, i) => shipment({ id: `s-${i}`, customerId: id, customer: "X" })), masterJobs: [] });
    refs.mockResolvedValue({ customers: [], contacts: [] } as never);
    repository.applyLinks.mockResolvedValue({ changed: 0, parties: [] });
    await partyLinksService.normalizeLinks(COMPANY);
    expect(refs.mock.calls.map(([req]) => req.customerIds.length)).toEqual([2000, 1]);
  });

  it("changes nothing when the Customer Database can't be read", async () => {
    repository.linksOf.mockResolvedValue({ shipments: [shipment({ customerId: ALFA })], masterJobs: [] });
    refs.mockRejectedValue(new Error("customers is unreachable"));
    await expect(partyLinksService.normalizeLinks(COMPANY)).rejects.toThrow("customers is unreachable");
    expect(repository.applyLinks).not.toHaveBeenCalled();
  });
});
