import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

// The change events' handlers read the Customer Database and tell the warehouse: stand-ins here.
const fake = vi.hoisted(() => ({ refs: vi.fn(), publish: vi.fn() }));
vi.mock("~encore/clients", () => ({ customers: { _internalCustomerRefs: fake.refs } }));
vi.mock("../../topics", () => ({ shipmentPartiesChanged: { publish: fake.publish } }));

import { db } from "../../db/db";
import { partyLinksRepository } from "../../repositories/partyLinks.repository";
import { partyLinksService } from "../../services/partyLinks.service";
import { shipmentTable } from "../../schemas/shipment.schema";
import { masterJobTable } from "../../schemas/masterJob.schema";

// The renames the Customer Database's change events cause, and the links backfill's writes,
// against the shipments database. Runs only under `encore test`
// (SHIPMENTS_DB_TESTS=1 encore test services/shipments/tests/db); a plain `vitest run` skips it.

const named = (name: string | null) => async () => name;
const shipmentOf = async (companyId: string, id: string) =>
  (await db.select().from(shipmentTable).where(and(eq(shipmentTable.companyId, companyId), eq(shipmentTable.id, id))))[0]!;

describe("renameCustomer", () => {
  it("renames the live copies of the customer, in its company only, and leaves updatedAt alone", async () => {
    const [companyId, otherCompany, customerId] = [randomUUID(), randomUUID(), randomUUID()];
    const old = new Date("2026-01-01T00:00:00Z");
    const [linked, deleted, foreign, unlinked] = await db
      .insert(shipmentTable)
      .values([
        { companyId, jobNumber: "CZ1", customerId, customer: "Alfa", shipperId: customerId, shipper: "Alfa", updatedAt: old },
        { companyId, jobNumber: "CZ2", customerId, customer: "Alfa", deletedAt: new Date() },
        { companyId: otherCompany, jobNumber: "CZ1", customerId, customer: "Alfa" },
        { companyId, jobNumber: "CZ3", customer: "Alfa" },
      ])
      .returning();
    const [masterJob] = await db.insert(masterJobTable).values({ companyId, mczNumber: "MCZ1", consigneeId: customerId, consignee: "Alfa" }).returning();

    const { changed, parties } = await partyLinksRepository.renameCustomer(companyId, customerId, named("Alfa s.r.o."));
    expect(changed).toBe(3);
    expect(parties).toEqual([{ id: linked!.id, customer: "Alfa s.r.o.", customerPic: "" }]);
    const after = await shipmentOf(companyId, linked!.id);
    expect(after).toMatchObject({ customer: "Alfa s.r.o.", shipper: "Alfa s.r.o." });
    expect(after.updatedAt).toEqual(old);
    expect((await shipmentOf(companyId, deleted!.id)).customer).toBe("Alfa");
    expect((await shipmentOf(otherCompany, foreign!.id)).customer).toBe("Alfa");
    expect((await shipmentOf(companyId, unlinked!.id)).customer).toBe("Alfa");
    const [mj] = await db.select().from(masterJobTable).where(eq(masterJobTable.id, masterJob!.id));
    expect(mj!.consignee).toBe("Alfa s.r.o.");

    // Delivered again: nothing left to change; a repeated delivery tells about the customer's shipments again.
    await expect(partyLinksRepository.renameCustomer(companyId, customerId, named("Alfa s.r.o."))).resolves.toEqual({ changed: 0, parties: [] });
    expect(await partyLinksRepository.partiesOfCustomer(companyId, customerId)).toEqual([{ id: linked!.id, customer: "Alfa s.r.o.", customerPic: "" }]);
  });

  it("lets renames of one customer take turns: one that read an older name never commits after one that read the newer", async () => {
    const [companyId, customerId] = [randomUUID(), randomUUID()];
    const [row] = await db.insert(shipmentTable).values({ companyId, jobNumber: "CZ1", customerId, customer: "Alfa" }).returning();
    const reads: string[] = [];
    let readOld!: (name: string) => void;
    const older = partyLinksRepository.renameCustomer(companyId, customerId, async () => {
      reads.push("older");
      return new Promise<string>((resolve) => (readOld = resolve));
    });
    while (!readOld) await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = partyLinksRepository.renameCustomer(companyId, customerId, async () => {
      // Its turn comes only once the older one has committed.
      reads.push(`newer, after ${(await shipmentOf(companyId, row!.id)).customer}`);
      return "Alfa Group";
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads).toEqual(["older"]);
    readOld("Alfa s.r.o.");
    await Promise.all([older, newer]);
    expect(reads).toEqual(["older", "newer, after Alfa s.r.o."]);
    expect((await shipmentOf(companyId, row!.id)).customer).toBe("Alfa Group");
  });

  it("undoes the rename when the name can't be read", async () => {
    const [companyId, customerId] = [randomUUID(), randomUUID()];
    const [row] = await db.insert(shipmentTable).values({ companyId, jobNumber: "CZ1", customerId, customer: "Alfa" }).returning();
    await expect(partyLinksRepository.renameCustomer(companyId, customerId, () => Promise.reject(new Error("customers is unreachable")))).rejects.toThrow();
    expect((await shipmentOf(companyId, row!.id)).customer).toBe("Alfa");
  });
});

describe("a delete's event", () => {
  /** The Customer Database as it reads now: the customer (null: deleted) and its live contacts. */
  const holds = (customerId: string, companyName: string | null, contacts: { id: string; name: string }[] = []) =>
    fake.refs.mockResolvedValue({
      customers: companyName === null ? [] : [{ id: customerId, companyName, label: "STANDARD" }],
      contacts: contacts.map((c) => ({ ...c, customerId, email: "", phone: "", isMain: false })),
    });

  beforeEach(() => {
    fake.refs.mockReset();
    fake.publish.mockReset();
  });

  it("writes the name a customer renamed and deleted at once was deleted with, keeps the ids, and a restore renames again", async () => {
    const [companyId, customerId] = [randomUUID(), randomUUID()];
    const [row] = await db.insert(shipmentTable).values({ companyId, jobNumber: "CZ1", customerId, customer: "Alfa", shipperId: customerId, shipper: "Alfa" }).returning();
    const [masterJob] = await db.insert(masterJobTable).values({ companyId, mczNumber: "MCZ1", consigneeId: customerId, consignee: "Alfa" }).returning();
    const event = { companyId, customerId, companyName: "Alfa Group", label: "STANDARD", deleted: false };

    // The rename's event is handled once the customer is gone: nothing to read.
    holds(customerId, null);
    await expect(partyLinksService.customerChanged(event)).resolves.toBe(0);
    expect((await shipmentOf(companyId, row!.id)).customer).toBe("Alfa");

    await expect(partyLinksService.customerChanged({ ...event, deleted: true })).resolves.toBe(3);
    expect(await shipmentOf(companyId, row!.id)).toMatchObject({ customer: "Alfa Group", customerId, shipper: "Alfa Group", shipperId: customerId });
    const [mj] = await db.select().from(masterJobTable).where(eq(masterJobTable.id, masterJob!.id));
    expect(mj).toMatchObject({ consignee: "Alfa Group", consigneeId: customerId });
    expect(fake.publish).toHaveBeenCalledExactlyOnceWith({ companyId, shipmentId: row!.id, customer: "Alfa Group", customerPic: "" });

    // Delivered again, or with no name: nothing more changes.
    await expect(partyLinksService.customerChanged({ ...event, deleted: true })).resolves.toBe(0);
    await expect(partyLinksService.customerChanged({ ...event, companyName: " ", deleted: true })).resolves.toBe(0);
    expect((await shipmentOf(companyId, row!.id)).customer).toBe("Alfa Group");

    // Restored (and renamed): an old delete's event writes the name it holds now.
    holds(customerId, "Alfa s.r.o.");
    await expect(partyLinksService.customerChanged({ ...event, deleted: true })).resolves.toBe(3);
    expect((await shipmentOf(companyId, row!.id)).customer).toBe("Alfa s.r.o.");
  });

  it("writes the name a contact renamed and deleted at once was deleted with, and keeps the link", async () => {
    const [companyId, customerId, contactId] = [randomUUID(), randomUUID(), randomUUID()];
    const [row] = await db
      .insert(shipmentTable)
      .values({ companyId, jobNumber: "CZ1", customerId, customer: "Alfa", customerPic: "Petr", customerPicContactId: contactId })
      .returning();
    const event = { companyId, customerId, contactId, name: "Petr Masák", email: "", phone: "", deleted: false };
    holds(customerId, "Alfa", []);
    await expect(partyLinksService.contactChanged(event)).resolves.toBe(0);
    await expect(partyLinksService.contactChanged({ ...event, deleted: true })).resolves.toBe(1);
    expect(await shipmentOf(companyId, row!.id)).toMatchObject({ customerPic: "Petr Masák", customerPicContactId: contactId });
    expect(fake.publish).toHaveBeenCalledExactlyOnceWith({ companyId, shipmentId: row!.id, customer: "Alfa", customerPic: "Petr Masák" });
  });
});

describe("renameContact", () => {
  it("renames the contact where it is linked as a contact of that same party", async () => {
    const [companyId, customerId, otherCustomer, contactId] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const [pic, shipperSide, stale] = await db
      .insert(shipmentTable)
      .values([
        { companyId, jobNumber: "CZ1", customerId, customerPic: "Petr", customerPicContactId: contactId },
        { companyId, jobNumber: "CZ2", shipperId: customerId, shipperContact: "Petr", shipperContactId: contactId },
        // The customer moved on but the link stayed: not this contact's customer any more.
        { companyId, jobNumber: "CZ3", customerId: otherCustomer, customerPic: "Petr", customerPicContactId: contactId },
      ])
      .returning();
    const { changed, parties } = await partyLinksRepository.renameContact(companyId, customerId, contactId, named("Petr Masák"));
    expect(changed).toBe(2);
    expect(parties.map((r) => r.id)).toEqual([pic!.id]);
    expect((await partyLinksRepository.partiesOfContact(companyId, customerId, contactId)).map((r) => r.id)).toEqual([pic!.id]);
    expect((await shipmentOf(companyId, pic!.id)).customerPic).toBe("Petr Masák");
    expect((await shipmentOf(companyId, shipperSide!.id)).shipperContact).toBe("Petr Masák");
    expect((await shipmentOf(companyId, stale!.id)).customerPic).toBe("Petr");
  });
});

describe("applyLinks", () => {
  it("writes a rewrite only while the row still holds what it was planned from", async () => {
    const [companyId, contactId] = [randomUUID(), randomUUID()];
    const [kept, edited] = await db
      .insert(shipmentTable)
      .values([
        { companyId, jobNumber: "CZ1", customerPic: "Petr" },
        { companyId, jobNumber: "CZ2", customerPic: "Jana" },
      ])
      .returning();
    const { changed } = await partyLinksRepository.applyLinks(
      companyId,
      {
        shipments: [
          { id: kept!.id, from: { customerPicContactId: null, customerPic: "Petr" }, to: { customerPicContactId: contactId, customerPic: "Petr Masák" }, values: 1 },
          { id: edited!.id, from: { customerPic: "Karel" }, to: { customerPic: "Karel Novák" }, values: 1 },
        ],
        masterJobs: [],
      },
    );
    expect(changed).toBe(1);
    expect(await shipmentOf(companyId, kept!.id)).toMatchObject({ customerPic: "Petr Masák", customerPicContactId: contactId });
    expect((await shipmentOf(companyId, edited!.id)).customerPic).toBe("Jana");
  });
});
