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

import { salesPreferenceRepository } from "../../repositories/salesPreference.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const COLUMNS = ["reference", "customer", "route"];

beforeEach(() => {
  fake.sent = [];
  fake.rows = [];
});

describe("get", () => {
  it("reads the company's live row of the key and hands out its value", async () => {
    // id, created_at, updated_at, deleted_at, company_id, pref_key, value
    fake.rows = [["id-1", "2026-10-12 08:00:00+00", "2026-10-12 08:00:00+00", null, COMPANY, "qh_cols", COLUMNS]];
    await expect(salesPreferenceRepository.get("qh_cols", COMPANY)).resolves.toEqual(COLUMNS);
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0]!.sql).toMatch(
      /from "sales_preference" where \("sales_preference"\."company_id" = \$1 and "sales_preference"\."pref_key" = \$2 and "sales_preference"\."deleted_at" is null\) limit \$3$/,
    );
    expect(fake.sent[0]!.params).toEqual([COMPANY, "qh_cols", 1]);
  });

  it("answers null when nothing is stored under the key", async () => {
    await expect(salesPreferenceRepository.get("saved_views", COMPANY)).resolves.toBeNull();
  });
});

describe("set", () => {
  it("is one statement: a new row, or the value over the company's live row of that key", async () => {
    await salesPreferenceRepository.set("qh_cols", COMPANY, COLUMNS);
    expect(fake.sent).toHaveLength(1);
    const [{ sql, params }] = fake.sent as [{ sql: string; params: unknown[] }];
    expect(sql).toBe(
      'insert into "sales_preference" ("id", "created_at", "updated_at", "deleted_at", "company_id", "pref_key", "value") ' +
        "values (default, default, default, default, $1, $2, $3) " +
        // The partial unique index sales_preference_company_key_unique, named by its columns and its condition.
        'on conflict ("company_id","pref_key") where deleted_at IS NULL ' +
        'do update set "updated_at" = $4, "value" = $5',
    );
    // The value goes in as JSON, the same for the new row and for the row that is there.
    expect(params).toEqual([COMPANY, "qh_cols", JSON.stringify(COLUMNS), expect.any(String), JSON.stringify(COLUMNS)]);
  });

  it("two first saves of a key at the same moment both succeed: neither looks before it writes", async () => {
    await Promise.all([
      salesPreferenceRepository.set("saved_views", COMPANY, [{ id: "1", label: "Hers" }]),
      salesPreferenceRepository.set("saved_views", COMPANY, [{ id: "2", label: "His" }]),
    ]);
    // No read whose answer the write would depend on: each save is its insert alone, and the
    // database lets the second one write over the row of the first instead of refusing it.
    expect(fake.sent).toHaveLength(2);
    for (const { sql } of fake.sent) {
      expect(sql).toMatch(/^insert into "sales_preference" /);
      expect(sql).toContain('on conflict ("company_id","pref_key") where deleted_at IS NULL do update set');
    }
  });
});
