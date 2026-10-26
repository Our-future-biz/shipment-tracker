import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The statements that rename the copies of a Customer Database customer or contact and apply the
// links backfill, run against a stand-in for the database that records what is done, in order.
// What the statements do to real rows is checked in tests/db/partyLinks.db.test.ts.
const fake = vi.hoisted(() => {
  const state = {
    steps: [] as string[],
    updates: [] as { table: unknown; values: Record<string, unknown>; where: unknown; fields: Record<string, unknown> }[],
    /** What each update returns, in turn; an update past the list returns nothing. */
    returned: [] as Record<string, unknown>[][],
    executed: [] as unknown[],
    selects: [] as { fields: Record<string, unknown>; table: unknown; where: unknown }[],
  };
  const run = (name: string) => ({
    execute: async (query: unknown) => {
      state.steps.push(`${name} execute`);
      state.executed.push(query);
    },
    select: (fields: Record<string, unknown>) => ({
      from: (table: unknown) => ({
        where: async (where: unknown) => {
          state.steps.push(`${name} select`);
          state.selects.push({ fields, table, where });
          return state.returned.shift() ?? [];
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (where: unknown) => ({
          returning: async (fields: Record<string, unknown>) => {
            state.steps.push(`${name} update`);
            state.updates.push({ table, values, where, fields });
            return state.returned.shift() ?? [];
          },
        }),
      }),
    }),
  });
  const tx = run("tx");
  const db = {
    ...run("db"),
    transaction: async (work: (transaction: typeof tx) => Promise<unknown>) => {
      state.steps.push("begin");
      const result = await work(tx);
      state.steps.push("commit");
      return result;
    },
  };
  return { state, db };
});

vi.mock("../../db/db", () => ({ db: fake.db }));

import { partyLinksRepository } from "../../repositories/partyLinks.repository";
import { masterJobTable } from "../../schemas/masterJob.schema";
import { shipmentTable } from "../../schemas/shipment.schema";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const ALFA = "00000000-0000-0000-0000-0000000000a1";
const PETR = "00000000-0000-0000-0000-00000000c001";

const dialect = new PgDialect();
/** A piece of a statement as Postgres gets it: its text and its parameters. */
const sent = (piece: unknown) => {
  const { sql, params } = dialect.sqlToQuery(piece as SQL);
  return { sql, params };
};

beforeEach(() => {
  fake.state.steps = [];
  fake.state.updates = [];
  fake.state.returned = [];
  fake.state.executed = [];
  fake.state.selects = [];
});

/** What a rename reads as the current name: records when it is asked, among the database steps. */
const current = (name: string | null) =>
  vi.fn(async () => {
    fake.state.steps.push("read name");
    return name;
  });

describe("renameCustomer", () => {
  it("writes the name into every copy holding the customer's id where it differs, on live rows of the company, in one transaction", async () => {
    const renamed = { id: "s-1", customer: "Alfa s.r.o.", customerPic: "" };
    fake.state.returned = [[renamed], [{ id: "s-2" }], [], [], [{ id: "m-1" }]];
    await expect(partyLinksRepository.renameCustomer(COMPANY, ALFA, current("Alfa s.r.o."))).resolves.toEqual({ changed: 3, parties: [renamed] });

    // The name is read once this customer's renames have given it its turn, inside the transaction.
    expect(fake.state.steps).toEqual(["begin", "tx execute", "read name", "tx update", "tx update", "tx update", "tx update", "tx update", "tx update", "commit"]);
    expect(sent(fake.state.executed[0])).toEqual({ sql: "select pg_advisory_xact_lock(hashtext($1))", params: [`shipments-customer-rename:${COMPANY}:${ALFA}`] });
    const [customer, shipper, consignee, principal, mjShipper, mjConsignee] = fake.state.updates;
    expect(customer!.values).toEqual({ customer: "Alfa s.r.o." });
    expect(sent(customer!.where)).toEqual({
      sql: '(("shipment"."company_id" = $1 and "shipment"."deleted_at" is null) and "shipment"."customer_id" = $2 and "shipment"."customer" <> $3)',
      params: [COMPANY, ALFA, "Alfa s.r.o."],
    });
    expect([shipper, consignee, principal].map((u) => u!.values)).toEqual([{ shipper: "Alfa s.r.o." }, { consignee: "Alfa s.r.o." }, { principalParty: "Alfa s.r.o." }]);
    expect(sent(principal!.where).sql).toContain('"shipment"."principal_party_id" = $2 and "shipment"."principal_party" <> $3');
    expect([mjShipper!.table, mjConsignee!.table]).toEqual([masterJobTable, masterJobTable]);
    expect(sent(mjConsignee!.where)).toEqual({
      sql: '(("master_job"."company_id" = $1 and "master_job"."deleted_at" is null) and "master_job"."consignee_id" = $2 and "master_job"."consignee" <> $3)',
      params: [COMPANY, ALFA, "Alfa s.r.o."],
    });
    // Nobody's updatedAt is touched.
    for (const update of fake.state.updates) expect(update.values).not.toHaveProperty("updatedAt");
  });

  it("writes nothing when the customer is gone or has no name", async () => {
    await expect(partyLinksRepository.renameCustomer(COMPANY, ALFA, current(null))).resolves.toEqual({ changed: 0, parties: [] });
    await expect(partyLinksRepository.renameCustomer(COMPANY, ALFA, current("  "))).resolves.toEqual({ changed: 0, parties: [] });
    expect(fake.state.updates).toEqual([]);
  });

  it("commits nothing when the name can't be read", async () => {
    await expect(partyLinksRepository.renameCustomer(COMPANY, ALFA, () => Promise.reject(new Error("customers is unreachable")))).rejects.toThrow("customers is unreachable");
    expect(fake.state.steps).not.toContain("commit");
  });
});

describe("renameContact", () => {
  it("writes the name where the contact is linked as a contact of that same party, and returns the shipments whose PIC changed", async () => {
    const renamed = { id: "s-1", customer: "Alfa s.r.o.", customerPic: "Petr Masák" };
    fake.state.returned = [[renamed], [], [{ id: "s-3" }]];
    await expect(partyLinksRepository.renameContact(COMPANY, ALFA, PETR, current("Petr Masák"))).resolves.toEqual({ changed: 2, parties: [renamed] });

    expect(fake.state.steps).toEqual(["begin", "tx execute", "read name", "tx update", "tx update", "tx update", "commit"]);
    expect(sent(fake.state.executed[0]).params).toEqual([`shipments-contact-rename:${COMPANY}:${PETR}`]);
    const [pic, shipperContact, consigneeContact] = fake.state.updates;
    expect(pic!.values).toEqual({ customerPic: "Petr Masák" });
    expect(sent(pic!.where)).toEqual({
      sql: '(("shipment"."company_id" = $1 and "shipment"."deleted_at" is null) and "shipment"."customer_pic_contact_id" = $2 and "shipment"."customer_id" = $3 and "shipment"."customer_pic" <> $4)',
      params: [COMPANY, PETR, ALFA, "Petr Masák"],
    });
    expect(shipperContact!.values).toEqual({ shipperContact: "Petr Masák" });
    expect(sent(shipperContact!.where).sql).toContain('"shipment"."shipper_contact_id" = $2 and "shipment"."shipper_id" = $3');
    expect(consigneeContact!.values).toEqual({ consigneeContact: "Petr Masák" });
    expect(sent(consigneeContact!.where).sql).toContain('"shipment"."consignee_contact_id" = $2 and "shipment"."consignee_id" = $3');
  });

  it("writes nothing when the contact is gone", async () => {
    await expect(partyLinksRepository.renameContact(COMPANY, ALFA, PETR, current(null))).resolves.toEqual({ changed: 0, parties: [] });
    expect(fake.state.updates).toEqual([]);
  });
});

describe("partiesOfCustomer / partiesOfContact", () => {
  it("read the company's live shipments whose Customer is the customer, or whose Customer's PIC is the contact", async () => {
    const row = { id: "s-1", customer: "Alfa s.r.o.", customerPic: "Petr Masák" };
    fake.state.returned = [[row], [row]];
    await expect(partyLinksRepository.partiesOfCustomer(COMPANY, ALFA)).resolves.toEqual([row]);
    await expect(partyLinksRepository.partiesOfContact(COMPANY, ALFA, PETR)).resolves.toEqual([row]);
    const [byCustomer, byContact] = fake.state.selects;
    expect(Object.keys(byCustomer!.fields)).toEqual(["id", "customer", "customerPic"]);
    expect(sent(byCustomer!.where)).toEqual({
      sql: '(("shipment"."company_id" = $1 and "shipment"."deleted_at" is null) and "shipment"."customer_id" = $2)',
      params: [COMPANY, ALFA],
    });
    expect(sent(byContact!.where)).toEqual({
      sql: '(("shipment"."company_id" = $1 and "shipment"."deleted_at" is null) and "shipment"."customer_pic_contact_id" = $2 and "shipment"."customer_id" = $3)',
      params: [COMPANY, PETR, ALFA],
    });
  });
});

describe("applyLinks", () => {
  it("changes each row only while it holds what the rewrite was planned from, and hands over the shipments whose Customer or PIC changed", async () => {
    fake.state.returned = [[{ id: "s-1", customer: "Alfa s.r.o.", customerPic: "Petr Masák" }], [], [{ id: "s-3", customer: "X", customerPic: "" }], [{ id: "m-1" }]];
    const written = await partyLinksRepository.applyLinks(
      COMPANY,
      {
        shipments: [
          { id: "s-1", from: { customerPicContactId: null, customerPic: "Petr" }, to: { customerPicContactId: PETR, customerPic: "Petr Masák" }, values: 1 },
          // Edited since the read: nothing changes, nothing counts.
          { id: "s-2", from: { customer: "Old" }, to: { customer: "New" }, values: 1 },
          { id: "s-3", from: { shipperContact: "eva" }, to: { shipperContact: "Eva Nová" }, values: 1 },
        ],
        masterJobs: [{ id: "m-1", from: { shipper: "ALFA" }, to: { shipper: "Alfa s.r.o." }, values: 1 }],
      },
    );
    // s-3 changed its Shipper Contact only: nobody copies that.
    expect(written).toEqual({ changed: 3, parties: [{ id: "s-1", customer: "Alfa s.r.o.", customerPic: "Petr Masák" }] });
    expect(fake.state.steps).toEqual(["begin", "tx update", "tx update", "tx update", "tx update", "commit"]);
    const [first, , , masterJob] = fake.state.updates;
    expect(first!.table).toBe(shipmentTable);
    expect(first!.values).toEqual({ customerPicContactId: PETR, customerPic: "Petr Masák" });
    expect(sent(first!.where)).toEqual({
      sql: '(("shipment"."company_id" = $1 and "shipment"."deleted_at" is null) and "shipment"."id" = $2 and "shipment"."customer_pic_contact_id" IS NOT DISTINCT FROM $3 and "shipment"."customer_pic" IS NOT DISTINCT FROM $4)',
      params: [COMPANY, "s-1", null, "Petr"],
    });
    expect(masterJob!.table).toBe(masterJobTable);
    expect(sent(masterJob!.where).params).toEqual([COMPANY, "m-1", "ALFA"]);
  });

  it("does nothing at all when there is nothing to change", async () => {
    await expect(partyLinksRepository.applyLinks(COMPANY, { shipments: [], masterJobs: [] })).resolves.toEqual({ changed: 0, parties: [] });
    expect(fake.state.steps).toEqual([]);
  });
});
