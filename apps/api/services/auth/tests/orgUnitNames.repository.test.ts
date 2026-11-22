import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The names a notice's audience line is read with, built against a stand-in for the database that records
// the query's WHERE and ORDER BY.
const asked = vi.hoisted(() => ({ where: [] as unknown[], orderBy: [] as unknown[], selects: 0 }));
vi.mock("../db/db", () => {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = (where: unknown) => {
    asked.where.push(where);
    return Object.assign(Promise.resolve([]), chain);
  };
  chain.orderBy = async (...order: unknown[]) => {
    asked.orderBy.push(...order);
    return [];
  };
  return {
    db: {
      select: () => {
        asked.selects++;
        return chain;
      },
    },
  };
});

import { branchRepository, countryRepository, departmentRepository } from "../repositories/orgUnit.repository";

const dialect = new PgDialect();
const lastWhere = () => dialect.sqlToQuery(asked.where.at(-1) as SQL);
const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const BRNO = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  Object.assign(asked, { where: [], orderBy: [], selects: 0 });
});

// Review of system-23: a branch, department or country removed after a notice was posted is still named on it.
describe("the names of a notice's branches, departments and countries", () => {
  it("are read for the company by id, the removed ones too", async () => {
    await branchRepository.namesByIds(COMPANY, [BRNO]);
    const branches = lastWhere();
    expect(branches.sql).toContain('"branch"."company_id" = $');
    expect(branches.sql).toContain('"branch"."id" in ($');
    expect(branches.sql).not.toContain("deleted_at");
    expect(branches.params).toEqual([COMPANY, BRNO]);
    await departmentRepository.namesByIds(COMPANY, [BRNO]);
    expect(lastWhere().sql).toContain('"department"."id" in ($');
    expect(lastWhere().sql).not.toContain("deleted_at");
  });

  it("of countries are read by code, the live row first, then the one removed last", async () => {
    await countryRepository.namesByCodes(COMPANY, ["AT", "CZ"]);
    const countries = lastWhere();
    expect(countries.sql).toContain('"country"."code" in ($');
    expect(countries.sql).not.toContain("deleted_at");
    expect(countries.params).toEqual([COMPANY, "AT", "CZ"]);
    expect(dialect.sqlToQuery(asked.orderBy[0] as SQL).sql).toBe('"country"."deleted_at" DESC NULLS FIRST');
  });

  it("are not looked up for no keys", async () => {
    await expect(branchRepository.namesByIds(COMPANY, [])).resolves.toEqual([]);
    await expect(departmentRepository.namesByIds(COMPANY, [])).resolves.toEqual([]);
    await expect(countryRepository.namesByCodes(COMPANY, [])).resolves.toEqual([]);
    expect(asked.selects).toBe(0);
  });
});
