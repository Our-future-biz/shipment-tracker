import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The customer-link statements of followupTask.repository run against a real sales database, each
// test in a transaction that is rolled back. Skipped unless SALES_DB_URL names one, e.g.
//   SALES_DB_URL=$(encore db conn-uri sales --test --write) npx vitest run services/sales/tests/db
const url = process.env.SALES_DB_URL;

vi.mock("../../db/db", async () => {
  if (!process.env.SALES_DB_URL) return { db: null, client: null };
  const { Client } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const client = new Client({ connectionString: process.env.SALES_DB_URL });
  await client.connect();
  return { db: drizzle(client), client };
});

import * as dbModule from "../../db/db";
import { followupTaskRepository as repo } from "../../repositories/followupTask.repository";

const client = (dbModule as unknown as { client: import("pg").Client | null }).client;

const ACME = "6d1c3f0e-1a2b-4c3d-8e9f-000000000001";
const OTHER = "6d1c3f0e-1a2b-4c3d-8e9f-000000000002";
const PAST = "2026-01-01T00:00:00.000Z";
let company: string;

async function insert(customerId: string | null, label: string, deleted = false) {
  const { rows } = await client!.query(
    `INSERT INTO followup_task (company_id, customer_id, customer_label, updated_at, deleted_at) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [company, customerId, label, PAST, deleted ? PAST : null],
  );
  return rows[0].id as string;
}

describe.skipIf(!url)("follow-up task customer links (database)", () => {
  beforeEach(async () => {
    company = randomUUID();
    await client!.query("BEGIN");
  });
  afterEach(async () => {
    await client!.query("ROLLBACK");
  });
  afterAll(async () => {
    await client?.end();
  });

  it("relabels the live tasks of the customer only, without touching updated_at", async () => {
    const a = await insert(ACME, "ACME");
    await insert(ACME, "ACME Logistics s.r.o.");
    await insert(ACME, "ACME", true);
    await insert(OTHER, "ACME");
    await insert(null, "ACME");
    expect(await repo.relabelCustomer(company, ACME, "ACME Logistics s.r.o.")).toBe(1);
    const { rows } = await client!.query(`SELECT customer_label, updated_at FROM followup_task WHERE id = $1`, [a]);
    expect(rows[0].customer_label).toBe("ACME Logistics s.r.o.");
    expect((rows[0].updated_at as Date).toISOString()).toBe(PAST);
    const { rows: left } = await client!.query(`SELECT count(*)::int AS n FROM followup_task WHERE company_id = $1 AND customer_label = 'ACME'`, [company]);
    expect(left[0].n).toBe(3);
    expect(await repo.relabelCustomer(company, ACME, "ACME Logistics s.r.o.")).toBe(0);
  });

  it("never blanks a task's customer name out", async () => {
    const a = await insert(ACME, "ACME");
    expect(await repo.relabelCustomer(company, ACME, "  ")).toBe(0);
    const { rows } = await client!.query(`SELECT customer_label FROM followup_task WHERE id = $1`, [a]);
    expect(rows[0].customer_label).toBe("ACME");
  });

  it("lists the customers the live tasks are linked to, by name, with how many", async () => {
    await insert(ACME, "ACME");
    await insert(ACME, "ACME");
    await insert(ACME, "ACME Logistics s.r.o.");
    await insert(OTHER, "Other", true);
    await insert(null, "Typed");
    const links = await repo.customerLinks(company);
    expect(links.sort((a, b) => a.customerLabel.localeCompare(b.customerLabel))).toEqual([
      { customerId: ACME, customerLabel: "ACME", count: 2 },
      { customerId: ACME, customerLabel: "ACME Logistics s.r.o.", count: 1 },
    ]);
  });
});
