import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The noticeboard's visibility SQL, built against a stand-in for the database that records the query's
// WHERE (the auth service has no database test run).
const asked = vi.hoisted(() => ({ where: [] as unknown[] }));
vi.mock("../db/db", () => {
  const chain: Record<string, unknown> = {};
  for (const step of ["from", "innerJoin", "leftJoin", "orderBy"]) chain[step] = () => chain;
  chain.where = (where: unknown) => {
    asked.where.push(where);
    return chain;
  };
  chain.limit = async () => [];
  return { db: { select: () => chain } };
});

import { announcementRepository } from "../repositories/announcement.repository";

const dialect = new PgDialect();
const lastWhere = () => dialect.sqlToQuery(asked.where.at(-1) as SQL);
const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const reader = {
  all: false,
  userId: "11111111-1111-4111-8111-111111111111",
  departmentId: "22222222-2222-4222-8222-222222222222",
  branchId: "33333333-3333-4333-8333-333333333333",
  country: "Czechia",
  countryCode: "CZ",
};

beforeEach(() => {
  asked.where = [];
});

describe("announcementRepository.listForAudience: an audience notice", () => {
  it("reaches the reader when each list is empty or holds their own, the ids compared as uuids", async () => {
    await announcementRepository.listForAudience(COMPANY, reader);
    const { sql, params } = lastWhere();
    expect(sql).toMatch(/\(cardinality\("announcement"\."country_codes"\) = 0 OR \$\d+::text = ANY\("announcement"\."country_codes"\)\)/);
    expect(sql).toMatch(/\(cardinality\("announcement"\."branch_ids"\) = 0 OR \$\d+::uuid = ANY\("announcement"\."branch_ids"\)\)/);
    expect(sql).toMatch(/\(cardinality\("announcement"\."department_ids"\) = 0 OR \$\d+::uuid = ANY\("announcement"\."department_ids"\)\)/);
    expect(params).toEqual(expect.arrayContaining([COMPANY, "audience", "CZ", reader.branchId, reader.departmentId]));
  });

  it("reaches a reader with no branch or department only through a list left empty", async () => {
    await announcementRepository.listForAudience(COMPANY, { ...reader, branchId: null, departmentId: null, country: null, countryCode: null });
    const { sql } = lastWhere();
    expect(sql).toContain('cardinality("announcement"."country_codes") = 0');
    expect(sql).toContain('cardinality("announcement"."branch_ids") = 0');
    expect(sql).toContain('cardinality("announcement"."department_ids") = 0');
    expect(sql).not.toContain("ANY(");
  });

  it("is not filtered for an admin, who moderates every board", async () => {
    await announcementRepository.listForAudience(COMPANY, { ...reader, all: true });
    const { sql, params } = lastWhere();
    expect(sql).not.toContain("cardinality");
    expect(params).toEqual([COMPANY]);
  });
});
