import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The filtered customer list, run against a stand-in for the database that records the condition
// it is asked for. What the statement returns from real rows is not checked here.
const fake = vi.hoisted(() => {
  const state = { wheres: [] as unknown[] };
  const db = {
    select: () => ({
      from: () => ({
        where: (where: unknown) => {
          state.wheres.push(where);
          return { orderBy: () => ({ limit: async () => [] }) };
        },
      }),
    }),
  };
  return { state, db };
});

vi.mock("../../db/db", () => ({ db: fake.db }));

import { customerRepository } from "../../repositories/customer.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";

const lastWhere = () => new PgDialect().sqlToQuery(fake.state.wheres.at(-1) as SQL);

beforeEach(() => {
  fake.state.wheres = [];
});

describe("listFiltered by role", () => {
  it("keeps the companies whose roles include the one asked for, within the company", async () => {
    await customerRepository.listFiltered(COMPANY, { role: "haulier" });
    const { sql, params } = lastWhere();
    expect(sql).toBe('("customer"."company_id" = $1 and "customer"."deleted_at" is null and "customer"."roles" @> $2)');
    // Drizzle sends the array as a Postgres array literal.
    expect(params).toEqual([COMPANY, '{"haulier"}']);
  });

  it("does not filter on roles when none is asked for", async () => {
    await customerRepository.listFiltered(COMPANY, {});
    expect(lastWhere().sql).not.toContain("roles");
  });
});
