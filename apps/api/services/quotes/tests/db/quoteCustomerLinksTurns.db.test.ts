import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The change events' writes (followCustomer / followContact) against a real quotes database: each
// runs in its own transaction under the customer's (or contact's) lock, so they need a pool, not
// one connection in a rolled-back transaction. The test's rows are deleted afterwards. Skipped
// unless QUOTES_DB_URL names one, e.g.
//   QUOTES_DB_URL=$(encore db conn-uri quotes --test --write) npx vitest run services/quotes/tests/db
const url = process.env.QUOTES_DB_URL;

vi.mock("../../db/db", async () => {
  if (!process.env.QUOTES_DB_URL) return { db: null, pool: null };
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({ connectionString: process.env.QUOTES_DB_URL, max: 4 });
  return { db: drizzle(pool), pool };
});

import * as dbModule from "../../db/db";
import { quoteCustomerLinksRepository as repo } from "../../repositories/quoteCustomerLinks.repository";

const pool = (dbModule as unknown as { pool: import("pg").Pool | null }).pool;

const ACME = "6d1c3f0e-1a2b-4c3d-8e9f-000000000001";
const PETR = "7a000000-0000-4000-8000-000000000001";

let company: string;

async function insert(quoteNumber: string, data: Record<string, unknown>) {
  await pool!.query(`INSERT INTO quote (company_id, quote_number, status, data) VALUES ($1, $2, 'draft', $3::jsonb)`, [company, quoteNumber, JSON.stringify(data)]);
}

async function dataOf(quoteNumber: string) {
  const { rows } = await pool!.query(`SELECT data FROM quote WHERE company_id = $1 AND quote_number = $2`, [company, quoteNumber]);
  return rows[0].data as Record<string, unknown>;
}

const until = async (ready: () => boolean) => {
  while (!ready()) await new Promise((resolve) => setTimeout(resolve, 5));
};

describe.skipIf(!url)("quote customer links: change events take turns (database)", () => {
  beforeEach(async () => {
    company = randomUUID();
    await insert("Q1", { customerId: ACME, customerName: "ACME", customerLabel: "STANDARD", customerContactId: PETR, customerContact: "Petr", customerEmail: "old@acme.cz", customerPhone: "" });
  });

  afterEach(async () => {
    await pool!.query(`DELETE FROM quote WHERE company_id = $1`, [company]);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("lets changes of one customer take turns: one that read an older name never commits after one that read the newer", async () => {
    const reads: string[] = [];
    let readOld: ((name: string) => void) | undefined;
    const older = repo.followCustomer(company, ACME, async () => {
      reads.push("older");
      return { name: await new Promise<string>((resolve) => (readOld = resolve)), label: "STANDARD" };
    });
    await until(() => readOld !== undefined);
    const newer = repo.followCustomer(company, ACME, async () => {
      // Its turn comes only once the older one has committed.
      reads.push(`newer, after ${(await dataOf("Q1")).customerName}`);
      return { name: "ACME Group", label: "KEY ACCOUNT" };
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads).toEqual(["older"]);
    readOld!("ACME Logistics s.r.o.");
    await Promise.all([older, newer]);
    expect(reads).toEqual(["older", "newer, after ACME Logistics s.r.o."]);
    expect(await dataOf("Q1")).toMatchObject({ customerName: "ACME Group", customerLabel: "KEY ACCOUNT" });
  });

  it("lets changes of one contact take turns the same way", async () => {
    const reads: string[] = [];
    let readOld: ((name: string) => void) | undefined;
    const older = repo.followContact(company, ACME, PETR, async () => {
      reads.push("older");
      return { name: await new Promise<string>((resolve) => (readOld = resolve)), email: "petr@acme.cz", phone: "", gone: false };
    });
    await until(() => readOld !== undefined);
    const newer = repo.followContact(company, ACME, PETR, async () => {
      reads.push(`newer, after ${(await dataOf("Q1")).customerContact}`);
      return { name: "Petr Masák", email: "petr.masak@acme.cz", phone: "+420 601 000 001", gone: true };
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads).toEqual(["older"]);
    readOld!("Petr M.");
    await Promise.all([older, newer]);
    expect(reads).toEqual(["older", "newer, after Petr M."]);
    // The later one found the contact gone: its last details stay, unlinked.
    expect(await dataOf("Q1")).toMatchObject({ customerContactId: "", customerContact: "Petr Masák", customerEmail: "petr.masak@acme.cz", customerPhone: "+420 601 000 001" });
  });

  it("leaves the quotes as they are when there is nothing to write, or when the read fails", async () => {
    expect(await repo.followCustomer(company, ACME, async () => null)).toEqual([]);
    expect(await repo.followContact(company, ACME, PETR, async () => null)).toEqual([]);
    await expect(repo.followCustomer(company, ACME, () => Promise.reject(new Error("customers is unreachable")))).rejects.toThrow();
    expect(await dataOf("Q1")).toMatchObject({ customerName: "ACME", customerContactId: PETR, customerContact: "Petr" });
  });
});
