import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The read the sales pipeline is fed from, run against a stand-in for the database that records
// what is asked for. What the statement returns from real rows is not checked here.
const fake = vi.hoisted(() => {
  const state = {
    found: [] as Record<string, unknown>[],
    reads: [] as { fields: Record<string, unknown>; where: unknown }[],
  };
  const db = {
    select: (fields: Record<string, unknown>) => ({
      from: () => ({
        where: async (where: unknown) => {
          state.reads.push({ fields, where });
          return state.found;
        },
      }),
    }),
  };
  return { state, db };
});

vi.mock("../../db/db", () => ({ db: fake.db }));

import { customerRepository } from "../../repositories/customer.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";

beforeEach(() => {
  fake.state.found = [];
  fake.state.reads = [];
});

describe("pipelineList", () => {
  it("reads every live customer of the company - no other condition, no limit", async () => {
    const customers = [{ id: "customer-1", companyName: "ITTEC, s.r.o.", status: "Prospect", label: "TARGET CUSTOMER", salesOwner: "Martin", createdAt: new Date("2026-09-01T08:00:00.000Z") }];
    fake.state.found = customers;
    await expect(customerRepository.pipelineList(COMPANY)).resolves.toEqual(customers);
    const { sql, params } = new PgDialect().sqlToQuery(fake.state.reads[0]!.where as SQL);
    expect(sql).toBe('("customer"."company_id" = $1 and "customer"."deleted_at" is null)');
    expect(params).toEqual([COMPANY]);
  });

  it("selects only what the pipeline shows of a customer: the logo, an image in the row, is not read", async () => {
    await customerRepository.pipelineList(COMPANY);
    expect(Object.keys(fake.state.reads[0]!.fields)).toEqual(["id", "companyName", "status", "label", "salesOwner", "createdAt"]);
  });
});
