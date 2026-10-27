import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The change events' writes against a stand-in for the database that records what is done, in
// order: the turn is taken before anything is read, and nothing blank is written. What the
// statements do to real rows is checked in tests/db (QUOTES_DB_URL).
const fake = vi.hoisted(() => {
  const state = { steps: [] as string[], executed: [] as unknown[], updates: [] as { values: Record<string, unknown> }[] };
  const tx = {
    execute: async (query: unknown) => {
      state.steps.push("lock");
      state.executed.push(query);
    },
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            state.steps.push("update");
            state.updates.push({ values });
            return [{ id: "q1" }];
          },
        }),
      }),
    }),
  };
  const db = {
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

import { quoteCustomerLinksRepository as repo } from "../../repositories/quoteCustomerLinks.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const ACME = "6d1c3f0e-1a2b-4c3d-8e9f-000000000001";
const PETR = "7a000000-0000-4000-8000-000000000001";

const dialect = new PgDialect();
const sent = (piece: unknown) => dialect.sqlToQuery(piece as SQL);

beforeEach(() => {
  fake.state.steps = [];
  fake.state.executed = [];
  fake.state.updates = [];
});

describe("followCustomer", () => {
  it("takes the customer's turn before it reads what to write", async () => {
    const read = vi.fn(async () => {
      fake.state.steps.push("read");
      return { name: "ACME Group", label: "KEY ACCOUNT" };
    });
    await expect(repo.followCustomer(COMPANY, ACME, read)).resolves.toEqual(["q1"]);
    expect(fake.state.steps).toEqual(["begin", "lock", "read", "update", "commit"]);
    expect(sent(fake.state.executed[0])).toMatchObject({ sql: "select pg_advisory_xact_lock(hashtext($1))", params: [`quotes-customer:${COMPANY}:${ACME}`] });
  });

  it("writes nothing when there is nothing to write, or only a blank name", async () => {
    await expect(repo.followCustomer(COMPANY, ACME, async () => null)).resolves.toEqual([]);
    await expect(repo.followCustomer(COMPANY, ACME, async () => ({ name: "  ", label: "RISK" }))).resolves.toEqual([]);
    expect(fake.state.updates).toEqual([]);
  });
});

describe("followContact", () => {
  it("takes the contact's turn before it reads what to write", async () => {
    const read = vi.fn(async () => {
      fake.state.steps.push("read");
      return { name: "Petr Masák", email: "petr@acme.cz", phone: "", gone: false };
    });
    await expect(repo.followContact(COMPANY, ACME, PETR, read)).resolves.toEqual(["q1"]);
    expect(fake.state.steps).toEqual(["begin", "lock", "read", "update", "commit"]);
    expect(sent(fake.state.executed[0]).params).toEqual([`quotes-contact:${COMPANY}:${PETR}`]);
  });

  it("writes nothing for a live contact with a blank name; a gone one is still unlinked, its text kept", async () => {
    await expect(repo.followContact(COMPANY, ACME, PETR, async () => null)).resolves.toEqual([]);
    await expect(repo.followContact(COMPANY, ACME, PETR, async () => ({ name: " ", email: "x@acme.cz", phone: "", gone: false }))).resolves.toEqual([]);
    expect(fake.state.updates).toEqual([]);
    await expect(repo.followContact(COMPANY, ACME, PETR, async () => ({ name: "", email: "", phone: "", gone: true }))).resolves.toEqual(["q1"]);
    const { sql, params } = sent(fake.state.updates[0]!.values.data);
    expect(sql).not.toContain("CASE");
    expect(params).toEqual([JSON.stringify({ customerContactId: "" })]);
  });

  it("unlinks a gone contact and gives its customer's quotes its last details in the same statement", async () => {
    await repo.followContact(COMPANY, ACME, PETR, async () => ({ name: "Petr Masák", email: "petr@acme.cz", phone: "+420 601 000 001", gone: true }));
    expect(fake.state.updates).toHaveLength(1);
    const { sql, params } = sent(fake.state.updates[0]!.values.data);
    expect(sql).toContain("CASE WHEN");
    expect(params).toContain(ACME);
    expect(params).toContain(JSON.stringify({ customerContact: "Petr Masák", customerEmail: "petr@acme.cz", customerPhone: "+420 601 000 001" }));
  });
});
