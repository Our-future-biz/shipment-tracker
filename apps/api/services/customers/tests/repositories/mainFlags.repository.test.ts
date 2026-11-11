import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The main contact and a site from before sites had addresses, made the customer's one main / default:
// the other one's flag is cleared in the same transaction as the write. Run against a stand-in for
// the database that records each step of the transaction in order.
const fake = vi.hoisted(() => {
  const state = {
    steps: [] as { op: string; table: string; set?: Record<string, unknown>; where?: SQL; values?: Record<string, unknown> }[],
    /** What the lock of the row being edited finds. */
    locked: [] as { id: string }[],
    committed: 0,
  };
  const tx = {
    select: () => ({
      from: (table: Table) => ({
        where: (where: SQL) => ({
          limit: () => ({
            for: async (mode: string) => {
              state.steps.push({ op: `select for ${mode}`, table: getTableName(table), where });
              return state.locked;
            },
          }),
        }),
      }),
    }),
    insert: (table: Table) => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          state.steps.push({ op: "insert", table: getTableName(table), values });
          return [{ id: "new", ...values }];
        },
      }),
    }),
    update: (table: Table) => ({
      set: (set: Record<string, unknown>) => ({
        where: (where: SQL) => {
          state.steps.push({ op: "update", table: getTableName(table), set, where });
          const result = Promise.resolve(undefined);
          return Object.assign(result, { returning: async () => [{ id: "k1", ...set }] });
        },
      }),
    }),
  };
  const db = {
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      const out = await fn(tx);
      state.committed++;
      return out;
    },
  };
  return { state, db };
});

vi.mock("../../db/db", () => ({ db: fake.db }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));

import { contactRepository } from "../../repositories/contact.repository";
import { customerSiteRepository } from "../../repositories/customerSite.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const dialect = new PgDialect();
const sent = (where: SQL | undefined) => dialect.sqlToQuery(where!);

beforeEach(() => {
  fake.state.steps = [];
  fake.state.locked = [{ id: "k1" }];
  fake.state.committed = 0;
});

describe("the customer's main contact", () => {
  it("a new main contact clears the other one's flag first, in the same transaction", async () => {
    await contactRepository.createInCustomer(COMPANY, { customerId: "c1", name: "Jana Nováková", firstName: "Jana", lastName: "Nováková", isMain: true });
    expect(fake.state.steps.map((s) => `${s.op} ${s.table}`)).toEqual(["update contact", "insert contact"]);
    expect(fake.state.steps[0]!.set).toMatchObject({ isMain: false });
    expect(sent(fake.state.steps[0]!.where).params).toEqual([COMPANY, "c1", true]);
    expect(fake.state.steps[1]!.values).toMatchObject({ companyId: COMPANY, customerId: "c1", isMain: true });
    expect(fake.state.committed).toBe(1);
  });

  it("an ordinary new contact touches nobody else", async () => {
    await contactRepository.createInCustomer(COMPANY, { customerId: "c1", name: "Jana Nováková", isMain: false });
    expect(fake.state.steps.map((s) => s.op)).toEqual(["insert"]);
  });

  it("an edit making one main locks it, clears the others (not itself), then writes it", async () => {
    await contactRepository.updateInCustomer("k1", COMPANY, "c1", { isMain: true });
    expect(fake.state.steps.map((s) => `${s.op} ${s.table}`)).toEqual(["select for update contact", "update contact", "update contact"]);
    const others = sent(fake.state.steps[1]!.where);
    expect(others.sql).toContain('"contact"."id" <> $');
    expect(others.params).toEqual([COMPANY, "c1", true, "k1"]);
    expect(fake.state.steps[2]!.set).toMatchObject({ isMain: true });
  });

  it("an edit of a contact deleted meanwhile changes nobody else", async () => {
    fake.state.locked = [];
    await expect(contactRepository.updateInCustomer("k1", COMPANY, "c1", { isMain: true })).resolves.toBeNull();
    expect(fake.state.steps.map((s) => s.op)).toEqual(["select for update"]);
  });
});

describe("the customer's default site (a site without an address)", () => {
  it("an edit making it the default locks it, clears the others, then writes it", async () => {
    fake.state.locked = [{ id: "s1" }];
    await customerSiteRepository.updateInCustomer("s1", COMPANY, "c1", { isDefault: true, label: "Dock B" });
    expect(fake.state.steps.map((s) => `${s.op} ${s.table}`)).toEqual(["select for update customer_site", "update customer_site", "update customer_site"]);
    expect(fake.state.steps[1]!.set).toMatchObject({ isDefault: false });
    expect(sent(fake.state.steps[1]!.where).params).toEqual([COMPANY, "c1", true, "s1"]);
    expect(fake.state.steps[2]!.set).toMatchObject({ isDefault: true, label: "Dock B" });
  });

  it("an edit that is not about the default touches no other site", async () => {
    fake.state.locked = [{ id: "s1" }];
    await customerSiteRepository.updateInCustomer("s1", COMPANY, "c1", { label: "Dock B" });
    expect(fake.state.steps.map((s) => s.op)).toEqual(["select for update", "update"]);
  });
});
