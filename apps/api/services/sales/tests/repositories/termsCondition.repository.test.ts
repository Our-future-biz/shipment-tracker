import { beforeEach, describe, expect, it, vi } from "vitest";

// The repository is run for real, down to the statements Postgres would get: the query builder
// is the real one, over a stand-in for the connection that records every statement and answers
// with the rows a test has laid out. What the statements do to real rows is not checked here -
// that needs a database.
const fake = vi.hoisted(() => ({
  sent: [] as { sql: string; params: unknown[] }[],
  /** What the next statement answers with: its rows, each a list of values in column order. */
  rows: [] as unknown[][],
}));

vi.mock("../../db/db", async () => {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const connection = {
    query: async (query: { text: string }, params: unknown[]) => {
      fake.sent.push({ sql: query.text, params });
      return { rows: fake.rows, rowCount: fake.rows.length };
    },
  };
  return { db: drizzle(connection as never) };
});

import { termsConditionRepository } from "../../repositories/termsCondition.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const ID = "0b8d5a0e-6a43-4f4a-9a53-5d0d3a2b6c11";
const DEFAULTS = ["AIR IMPORT", "AIR EXPORT"];

const only = () => {
  expect(fake.sent).toHaveLength(1);
  return fake.sent[0]!;
};

beforeEach(() => {
  fake.sent = [];
  fake.rows = [];
});

describe("countEver", () => {
  it("counts the company's templates, the deleted ones included", async () => {
    fake.rows = [["6"]];
    await expect(termsConditionRepository.countEver(COMPANY)).resolves.toBe(6);
    const { sql, params } = only();
    expect(sql).toBe('select count(*) from "terms_condition" where "terms_condition"."company_id" = $1');
    expect(sql).not.toContain("deleted_at");
    expect(params).toEqual([COMPANY]);
  });
});

describe("seed", () => {
  it("inserts the names as empty templates of the company in one statement, leaving out a name that is taken", async () => {
    await termsConditionRepository.seed(COMPANY, DEFAULTS);
    const { sql, params } = only();
    expect(sql).toBe(
      'insert into "terms_condition" ("id", "created_at", "updated_at", "deleted_at", "company_id", "name", "includes", "excludes") ' +
        "values (default, default, default, default, $1, $2, default, default), (default, default, default, default, $3, $4, default, default) " +
        "on conflict do nothing",
    );
    expect(params).toEqual([COMPANY, "AIR IMPORT", COMPANY, "AIR EXPORT"]);
  });

  it("two first loads at the same moment cannot fail each other: neither looks before it writes", async () => {
    await Promise.all([termsConditionRepository.seed(COMPANY, DEFAULTS), termsConditionRepository.seed(COMPANY, DEFAULTS)]);
    expect(fake.sent).toHaveLength(2);
    for (const { sql } of fake.sent) expect(sql).toMatch(/^insert into "terms_condition" .* on conflict do nothing$/);
  });
});

describe("updateIfUnchanged", () => {
  const EXPECTED = new Date("2026-10-12T08:00:00.123Z");

  it("puts the version into the UPDATE itself: the company's live template, still as the caller loaded it", async () => {
    // id, created_at, updated_at, deleted_at, company_id, name, includes, excludes
    fake.rows = [[ID, "2026-10-01 07:00:00+00", "2026-10-12 09:00:00.5+00", null, COMPANY, "AIR IMPORT", "Freight", ""]];
    const written = await termsConditionRepository.updateIfUnchanged(ID, COMPANY, { includes: "Freight" }, EXPECTED);
    const { sql, params } = only();
    expect(sql).toBe(
      'update "terms_condition" set "updated_at" = $1, "includes" = $2 ' +
        'where ("terms_condition"."id" = $3 and "terms_condition"."company_id" = $4 and "terms_condition"."deleted_at" is null ' +
        // Cut to milliseconds: a row stamped by the database carries microseconds the caller never saw.
        `and date_trunc('milliseconds', "terms_condition"."updated_at") = $5::timestamptz) ` +
        'returning "id", "created_at", "updated_at", "deleted_at", "company_id", "name", "includes", "excludes"',
    );
    expect(params).toEqual([expect.any(String), "Freight", ID, COMPANY, "2026-10-12T08:00:00.123Z"]);
    // The row as written, with the new version a next save names.
    expect(written).toMatchObject({ id: ID, includes: "Freight", updatedAt: new Date("2026-10-12T09:00:00.500Z") });
  });

  it("stamps the write with a moment in milliseconds, later than the version it replaces", async () => {
    const before = Date.now();
    await termsConditionRepository.updateIfUnchanged(ID, COMPANY, { excludes: "Duties" }, EXPECTED);
    const stamp = String(only().params[0]);
    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Date.parse(stamp)).toBeGreaterThanOrEqual(before);
  });

  it("answers null when nothing was written - the template is gone, or somebody saved it since", async () => {
    await expect(termsConditionRepository.updateIfUnchanged(ID, COMPANY, { includes: "Freight" }, EXPECTED)).resolves.toBeNull();
  });
});
