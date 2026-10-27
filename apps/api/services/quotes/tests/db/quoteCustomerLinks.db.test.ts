import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The statements of quoteCustomerLinks.repository run against a real quotes database, each test in
// a transaction that is rolled back. Skipped unless QUOTES_DB_URL names one, e.g.
//   QUOTES_DB_URL=$(encore db conn-uri quotes --test --write) npx vitest run services/quotes/tests/db
const url = process.env.QUOTES_DB_URL;

vi.mock("../../db/db", async () => {
  if (!process.env.QUOTES_DB_URL) return { db: null, client: null };
  const { Client } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const client = new Client({ connectionString: process.env.QUOTES_DB_URL });
  await client.connect();
  return { db: drizzle(client), client };
});

import * as dbModule from "../../db/db";
import { quoteCustomerLinksRepository as repo } from "../../repositories/quoteCustomerLinks.repository";

const client = (dbModule as unknown as { client: import("pg").Client | null }).client;
// The statements run on the test's connection, inside its transaction.
const writer = dbModule.db;

const ACME = "6d1c3f0e-1a2b-4c3d-8e9f-000000000001";
const OTHER = "6d1c3f0e-1a2b-4c3d-8e9f-000000000002";
const PETR = "7a000000-0000-4000-8000-000000000001";
const PAST = "2026-01-01T00:00:00.000Z";

let company: string;

async function insert(quoteNumber: string, status: string | null, data: Record<string, unknown>, extra: { deleted?: boolean } = {}) {
  await client!.query(
    `INSERT INTO quote (company_id, quote_number, status, data, updated_at, data_version, deleted_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, 3, $6)`,
    [company, quoteNumber, status, JSON.stringify(data), PAST, extra.deleted ? PAST : null],
  );
}

async function row(quoteNumber: string) {
  const { rows } = await client!.query(`SELECT data, updated_at, data_version FROM quote WHERE company_id = $1 AND quote_number = $2`, [company, quoteNumber]);
  return rows[0] as { data: Record<string, unknown>; updated_at: Date; data_version: number };
}

const linked = { customerId: ACME, customerName: "ACME", customerLabel: "STANDARD", customerContactId: PETR, customerContact: "Petr", customerEmail: "old@acme.cz", customerPhone: "", timeline: [{ status: "draft" }] };

describe.skipIf(!url)("quote customer links (database)", () => {
  beforeEach(async () => {
    company = randomUUID();
    await client!.query("BEGIN");
    await insert("Q-DRAFT", "draft", linked);
    await insert("Q-READY", "ready_to_send", linked);
    await insert("Q-REVISED", "revised", linked);
    await insert("Q-WONREV", "won", { ...linked, wonRevisionOf: "Q-WON" });
    await insert("Q-WON", "won", linked);
    await insert("Q-QUOTED", "quoted", linked);
    await insert("Q-LOST", "lost", linked);
    await insert("Q-DELETED", "draft", linked, { deleted: true });
    await insert("Q-OLD", null, linked);
    await insert("Q-OTHER", "draft", { ...linked, customerId: OTHER });
  });

  afterEach(async () => {
    await client!.query("ROLLBACK");
  });

  afterAll(async () => {
    await client?.end();
  });

  const OPEN = ["Q-DRAFT", "Q-READY", "Q-REVISED", "Q-WONREV"];

  it("renames the customer on its open quotes only, without touching anything else of them", async () => {
    const ids = await repo.renameCustomer(writer, company, ACME, { name: "ACME Logistics s.r.o.", label: "KEY ACCOUNT" });
    expect(ids).toHaveLength(4);
    for (const ref of OPEN) {
      const r = await row(ref);
      expect(r.data).toEqual({ ...linked, ...(ref === "Q-WONREV" ? { wonRevisionOf: "Q-WON" } : {}), customerName: "ACME Logistics s.r.o.", customerLabel: "KEY ACCOUNT" });
      expect(r.updated_at.toISOString()).toBe(PAST);
      expect(r.data_version).toBe(3);
    }
    for (const ref of ["Q-WON", "Q-QUOTED", "Q-LOST", "Q-DELETED", "Q-OLD", "Q-OTHER"]) expect((await row(ref)).data.customerName).toBe("ACME");
    // Again: nothing left to change.
    expect(await repo.renameCustomer(writer, company, ACME, { name: "ACME Logistics s.r.o.", label: "KEY ACCOUNT" })).toEqual([]);
  });

  it("never blanks the customer's name out, and keeps the account type when none is given", async () => {
    expect(await repo.renameCustomer(writer, company, ACME, { name: "  ", label: "RISK" })).toEqual([]);
    expect((await row("Q-DRAFT")).data).toMatchObject({ customerName: "ACME", customerLabel: "STANDARD" });
    expect(await repo.renameCustomer(writer, company, ACME, { name: "ACME Group", label: "" })).toHaveLength(4);
    expect((await row("Q-DRAFT")).data).toMatchObject({ customerName: "ACME Group", customerLabel: "STANDARD" });
  });

  it("refreshes a linked contact on the open quotes of its customer, and only what differs", async () => {
    const ids = await repo.refreshContact(writer, company, ACME, PETR, { name: "Petr Masák", email: "petr@acme.cz", phone: "+420 601 000 001" });
    expect(ids).toHaveLength(4);
    expect((await row("Q-DRAFT")).data).toMatchObject({ customerContactId: PETR, customerContact: "Petr Masák", customerEmail: "petr@acme.cz", customerPhone: "+420 601 000 001", timeline: [{ status: "draft" }] });
    expect((await row("Q-QUOTED")).data.customerContact).toBe("Petr");
    // The contact of another customer's quote is not this one, whatever its id says.
    expect((await row("Q-OTHER")).data.customerContact).toBe("Petr");
    expect(await repo.refreshContact(writer, company, ACME, PETR, { name: "Petr Masák", email: "petr@acme.cz", phone: "+420 601 000 001" })).toEqual([]);
  });

  it("never blanks a contact's name out", async () => {
    expect(await repo.refreshContact(writer, company, ACME, PETR, { name: " ", email: "x@acme.cz", phone: "" })).toEqual([]);
    expect((await row("Q-DRAFT")).data).toMatchObject({ customerContact: "Petr", customerEmail: "old@acme.cz" });
  });

  it("unlinks a deleted contact from the open quotes, giving its customer's quotes its last details in the same statement", async () => {
    expect(await repo.unlinkContact(writer, company, ACME, PETR, { name: "Petr Masák", email: "petr@acme.cz", phone: "+420 601 000 001" })).toHaveLength(5);
    expect((await row("Q-DRAFT")).data).toMatchObject({
      customerContactId: "",
      customerContact: "Petr Masák",
      customerEmail: "petr@acme.cz",
      customerPhone: "+420 601 000 001",
      timeline: [{ status: "draft" }],
    });
    // Another customer's quote that named the contact is unlinked, its text left as it was.
    expect((await row("Q-OTHER")).data).toMatchObject({ customerContactId: "", customerContact: "Petr", customerEmail: "old@acme.cz" });
    expect((await row("Q-QUOTED")).data).toMatchObject({ customerContactId: PETR, customerContact: "Petr" });
    expect((await row("Q-DRAFT")).updated_at.toISOString()).toBe(PAST);
  });

  it("unlinks a deleted contact without a last name, keeping the text the quotes have", async () => {
    expect(await repo.unlinkContact(writer, company, ACME, PETR, { name: "", email: "", phone: "" })).toHaveLength(5);
    expect((await row("Q-DRAFT")).data).toMatchObject({ customerContactId: "", customerContact: "Petr", customerEmail: "old@acme.cz" });
  });

  it("reads the open quotes that name a customer, with their customer keys only", async () => {
    const quotes = await repo.openWithCustomer(company);
    expect(quotes.map((q) => q.quoteNumber)).toEqual(["Q-DRAFT", "Q-OTHER", "Q-READY", "Q-REVISED", "Q-WONREV"]);
    const { timeline: _timeline, ...keys } = linked;
    expect(quotes[0]).toMatchObject({ customerId: ACME, doc: keys });
  });

  it("applies a refresh only while the quote still names the contact it was read with", async () => {
    const [draft] = await repo.openWithCustomer(company);
    const change = { set: { customerContact: "Petr Masák", customerName: "ACME Logistics s.r.o.", customerContactId: "" } };
    // An editor saved another contact meanwhile.
    await client!.query(`UPDATE quote SET data = data || '{"customerContact":"Jana"}'::jsonb WHERE company_id = $1 AND quote_number = 'Q-DRAFT'`, [company]);
    expect(await repo.applyCopies(company, draft!.id, { customerId: ACME, doc: draft!.doc }, change)).toBe(false);
    await client!.query(`UPDATE quote SET data = data || '{"customerContact":"Petr"}'::jsonb WHERE company_id = $1 AND quote_number = 'Q-DRAFT'`, [company]);
    expect(await repo.applyCopies(company, draft!.id, { customerId: ACME, doc: draft!.doc }, change)).toBe(true);
    const r = await row("Q-DRAFT");
    expect(r.data).toMatchObject({ customerContact: "Petr Masák", customerName: "ACME Logistics s.r.o.", customerContactId: "", timeline: [{ status: "draft" }] });
    expect(r.updated_at.toISOString()).toBe(PAST);
  });

  it("matches a contact typed by hand (\"\") only against \"\"", async () => {
    await insert("Q-TYPED", "draft", { customerId: ACME, customerName: "ACME", customerContactId: "", customerContact: "Petr" });
    const typed = (await repo.openWithCustomer(company)).find((q) => q.quoteNumber === "Q-TYPED")!;
    expect(typed.doc).toEqual({ customerId: ACME, customerName: "ACME", customerContactId: "", customerContact: "Petr" });
    const change = { set: { customerName: "ACME Logistics s.r.o." } };
    expect(await repo.applyCopies(company, typed.id, { customerId: ACME, doc: { ...typed.doc, customerContactId: PETR } }, change)).toBe(false);
    expect(await repo.applyCopies(company, typed.id, { customerId: ACME, doc: typed.doc }, change)).toBe(true);
  });

  it("matches a quote without a contact key against a doc without one", async () => {
    await insert("Q-BARE", "draft", { customerId: ACME, customerName: "ACME" });
    const bare = (await repo.openWithCustomer(company)).find((q) => q.quoteNumber === "Q-BARE")!;
    expect(bare.doc).toEqual({ customerId: ACME, customerName: "ACME" });
    expect(await repo.applyCopies(company, bare.id, { customerId: ACME, doc: bare.doc }, { set: { customerName: "ACME Logistics s.r.o." } })).toBe(true);
  });
});
