import { beforeEach, describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// A registration number is looked up in one country's register: read against a stand-in for the
// database that records the condition of the read.
const fake = vi.hoisted(() => {
  const state = { wheres: [] as SQL[] };
  const db = {
    select: () => ({
      from: () => ({
        where: (where: SQL) => ({
          limit: async () => {
            state.wheres.push(where);
            return [];
          },
        }),
      }),
    }),
  };
  return { state, db };
});

vi.mock("../../db/db", () => ({ db: fake.db }));

import { customerRepository } from "../../repositories/customer.repository";
import { registerCountry } from "../../lib/registerNumber";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";

beforeEach(() => {
  fake.state.wheres = [];
});

describe("a customer by its registration number", () => {
  it("is looked for in the company's live customers of that country only", async () => {
    await customerRepository.findByIco("HRB 12345", "de", COMPANY);
    const { sql, params } = new PgDialect().sqlToQuery(fake.state.wheres[0]!);
    expect(sql).toBe(`("customer"."company_id" = $1 and "customer"."country" = $2 and "customer"."ico" = $3 and "customer"."deleted_at" is null)`);
    expect(params).toEqual([COMPANY, "DE", "HRB 12345"]);
  });

  it("reads a blank country as CZ, the way migration 0038 stored the old rows", async () => {
    expect(registerCountry(" sk ")).toBe("SK");
    expect(registerCountry("")).toBe("CZ");
    expect(registerCountry("  ")).toBe("CZ");
    await customerRepository.findByIco("12345678", "", COMPANY);
    expect(new PgDialect().sqlToQuery(fake.state.wheres[0]!).params).toEqual([COMPANY, "CZ", "12345678"]);
  });
});
