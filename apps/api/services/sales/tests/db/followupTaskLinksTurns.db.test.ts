import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The customer change event's write (followCustomer) against a real sales database: it runs in its
// own transaction under the customer's lock, so it needs a pool, not one connection in a
// rolled-back transaction. The test's rows are deleted afterwards. Skipped unless SALES_DB_URL
// names one, e.g.
//   SALES_DB_URL=$(encore db conn-uri sales --test --write) npx vitest run services/sales/tests/db
const url = process.env.SALES_DB_URL;

vi.mock("../../db/db", async () => {
  if (!process.env.SALES_DB_URL) return { db: null, pool: null };
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({ connectionString: process.env.SALES_DB_URL, max: 4 });
  return { db: drizzle(pool), pool };
});

import * as dbModule from "../../db/db";
import { followupTaskRepository as repo } from "../../repositories/followupTask.repository";

const pool = (dbModule as unknown as { pool: import("pg").Pool | null }).pool;

const ACME = "6d1c3f0e-1a2b-4c3d-8e9f-000000000001";
let company: string;
let task: string;

const labelOf = async (id: string) => (await pool!.query(`SELECT customer_label FROM followup_task WHERE id = $1`, [id])).rows[0].customer_label as string;

describe.skipIf(!url)("follow-up task customer links: change events take turns (database)", () => {
  beforeEach(async () => {
    company = randomUUID();
    const { rows } = await pool!.query(`INSERT INTO followup_task (company_id, customer_id, customer_label) VALUES ($1, $2, 'ACME') RETURNING id`, [company, ACME]);
    task = rows[0].id;
  });
  afterEach(async () => {
    await pool!.query(`DELETE FROM followup_task WHERE company_id = $1`, [company]);
  });
  afterAll(async () => {
    await pool?.end();
  });

  it("lets changes of one customer take turns: one that read an older name never commits after one that read the newer", async () => {
    const reads: string[] = [];
    let readOld: ((name: string) => void) | undefined;
    const older = repo.followCustomer(company, ACME, async () => {
      reads.push("older");
      return new Promise<string>((resolve) => (readOld = resolve));
    });
    while (!readOld) await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = repo.followCustomer(company, ACME, async () => {
      // Its turn comes only once the older one has committed.
      reads.push(`newer, after ${await labelOf(task)}`);
      return "ACME Group";
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads).toEqual(["older"]);
    readOld("ACME Logistics s.r.o.");
    await Promise.all([older, newer]);
    expect(reads).toEqual(["older", "newer, after ACME Logistics s.r.o."]);
    expect(await labelOf(task)).toBe("ACME Group");
  });

  it("leaves the tasks as they are when there is no name to write, or when the read fails", async () => {
    expect(await repo.followCustomer(company, ACME, async () => null)).toBe(0);
    expect(await repo.followCustomer(company, ACME, async () => " ")).toBe(0);
    await expect(repo.followCustomer(company, ACME, () => Promise.reject(new Error("customers is unreachable")))).rejects.toThrow();
    expect(await labelOf(task)).toBe("ACME");
  });
});
